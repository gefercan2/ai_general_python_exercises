#!/usr/bin/env python3
"""
Lexia backend: static server + file parsing + topic modelling + spaCy + SQLite store + Ollama bridge.
Start:  python3 run.py      (the standard library alone is enough to start)
Optional extras (each unlocks a feature):  pip install -r requirements.txt
"""
import http.server, urllib.request, urllib.error, urllib.parse
import json, webbrowser, threading, os, re, io, sqlite3, hashlib, time
import importlib.util, statistics, math, socket, sys, traceback, warnings
from collections import Counter
from contextlib import closing
from html.parser import HTMLParser

try:
    import lexia_memory
except Exception as _e:        # file missing or broken: the app simply runs without it
    lexia_memory = None
    if not isinstance(_e, ModuleNotFoundError):
        print("Memory add-on failed to load:", _e)

PORT = int(os.environ.get("LEXIA_PORT", 8000))
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE, "lexia_data")
DB_PATH = os.path.join(DATA_DIR, "lexia.db")
MAX_BODY = 100 * 1024 * 1024  # 100 MB upload cap
THINK_RE = re.compile(r"<think>[\s\S]*?</think>", re.I)


class MissingDep(Exception): pass
class LLMError(Exception): pass


def has(mod):
    try:
        return importlib.util.find_spec(mod) is not None
    except Exception:
        return False


# ═══════════════ PHASE E — SQLITE STORE ═══════════════
def db():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    return con


def run_sql(sql, args=(), fetch=False):
    with closing(db()) as con:
        cur = con.execute(sql, args)
        rows = [dict(r) for r in cur.fetchall()] if fetch else None
        con.commit()
        return rows


def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    with closing(db()) as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS llm_cache(
            key TEXT PRIMARY KEY, task TEXT, model TEXT, version TEXT,
            response TEXT, created_at REAL);
        CREATE TABLE IF NOT EXISTS annotations(
            id TEXT PRIMARY KEY, project TEXT DEFAULT 'default', source TEXT,
            para_idx INTEGER, quote TEXT, note TEXT, created_at TEXT);
        """)
        con.commit()


# ═══════════════ PHASE A — PARSERS ═══════════════
def decode_bytes(b):
    if b[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return b.decode("utf-16", errors="replace")
    try:
        return b.decode("utf-8-sig")
    except UnicodeDecodeError:
        return b.decode("cp1252", errors="replace")


def reflow(text):
    """PDF text has hard line breaks; rebuild paragraphs and fix hyphenation."""
    lines = [l.strip() for l in text.replace("\r", "").split("\n")]
    lens = [len(l) for l in lines if len(l) > 20]
    typical = statistics.median(lens) if lens else 80
    paras, buf = [], ""
    for l in lines:
        if not l:
            if buf:
                paras.append(buf); buf = ""
            continue
        if re.fullmatch(r"\d{1,4}", l):  # bare page numbers
            continue
        if buf.endswith("-") and l[:1].islower():
            buf = buf[:-1] + l
        else:
            buf = (buf + " " + l) if buf else l
        if len(l) < typical * 0.6 and re.search(r'[.!?:"”’)\]]$', l):
            paras.append(buf); buf = ""
    if buf:
        paras.append(buf)
    return "\n\n".join(paras)


def parse_pdf(b):
    if not has("pypdf"):
        raise MissingDep("PDF support needs:  pip install pypdf")
    from pypdf import PdfReader
    r = PdfReader(io.BytesIO(b))
    if getattr(r, "is_encrypted", False):
        try:
            r.decrypt("")
        except Exception:
            raise ValueError("This PDF is password-protected")
    pages = []
    for p in r.pages:
        try:
            pages.append(p.extract_text() or "")
        except Exception:
            pages.append("")
    text = reflow("\n".join(pages))
    if len(text.strip()) < 50:
        raise ValueError("No extractable text (scanned PDF? OCR is not included)")
    return text, len(r.pages)


def parse_docx(b):
    if not has("docx"):
        raise MissingDep("Word support needs:  pip install python-docx")
    from docx import Document
    d = Document(io.BytesIO(b))
    parts = [p.text.strip() for p in d.paragraphs if p.text.strip()]
    return "\n\n".join(parts), len(parts)


class _HTMLText(HTMLParser):
    BLOCK = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6",
             "tr", "blockquote", "section", "article", "pre", "td", "th"}
    SKIP = {"script", "style", "noscript", "nav", "footer", "aside", "form", "svg", "iframe"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP: self.skip += 1
        elif tag in self.BLOCK: self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP: self.skip = max(0, self.skip - 1)
        elif tag in self.BLOCK: self.out.append("\n")

    def handle_data(self, data):
        if not self.skip: self.out.append(data)


def parse_html(b):
    p = _HTMLText()
    p.feed(decode_bytes(b))
    lines = [re.sub(r"\s+", " ", l).strip() for l in "".join(p.out).split("\n")]
    paras = [l for l in lines if l]
    return "\n\n".join(paras), len(paras)


def parse_file(name, data):
    ext = os.path.splitext(name)[1].lower().lstrip(".")
    if ext == "pdf": return parse_pdf(data)
    if ext == "docx": return parse_docx(data)
    if ext in ("html", "htm"): return parse_html(data)
    if ext in ("txt", "md", "csv", ""): return decode_bytes(data), 1
    raise ValueError("Unsupported file type: ." + ext)


# ═══════════════ PHASE C — TOPICS (NMF) ═══════════════
def chunk_paragraphs(paras):
    """Split into windows of words so small corpora still yield enough documents."""
    total = sum(len(p.get("text", "").split()) for p in paras)
    window = max(30, min(120, total // 40))
    docs, owner = [], []
    for p in paras:
        words = p.get("text", "").split()
        if len(words) < 8:
            continue
        for i in range(0, len(words), window):
            piece = words[i:i + window]
            if len(piece) >= 8:
                docs.append(" ".join(piece)); owner.append(p["idx"])
    return docs, owner


def topics_nmf(paras, stopwords, k=None):
    if not has("sklearn"):
        raise MissingDep("Topic modelling needs:  pip install scikit-learn")
    from sklearn.feature_extraction.text import TfidfVectorizer, ENGLISH_STOP_WORDS
    from sklearn.decomposition import NMF

    docs, owner = chunk_paragraphs(paras)
    if len(docs) < 4:
        return []
    sw = set(ENGLISH_STOP_WORDS) | {w.lower() for w in stopwords}
    vec = TfidfVectorizer(lowercase=True, stop_words=list(sw),
                          token_pattern=r"(?u)\b[^\W\d_]{3,}\b",
                          max_df=0.6, min_df=2 if len(docs) >= 20 else 1, sublinear_tf=True)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            X = vec.fit_transform(docs)
        except ValueError:
            return []
        if not k:
            k = int(max(3, min(8, round(math.sqrt(len(docs)) / 1.6))))
        k = min(k, X.shape[0] - 1, X.shape[1] - 1)
        if k < 2:
            return []
        model = NMF(n_components=k, init="nndsvd", random_state=0, max_iter=500)
        W = model.fit_transform(X)
        H = model.components_

    terms = vec.get_feature_names_out()
    total_w = float(W.sum()) or 1.0
    out = []
    for t in range(k):
        top = H[t].argsort()[::-1][:10]
        words = [{"word": str(terms[i]), "weight": round(float(H[t][i]), 4)}
                 for i in top if H[t][i] > 0]
        if len(words) < 3:
            continue
        best = {}
        for d, own in enumerate(owner):
            w = float(W[d][t])
            if w > best.get(own, 0):
                best[own] = w
        ranked = sorted(best.items(), key=lambda x: -x[1])[:5]
        out.append({"id": t + 1, "words": words, "paras": [p for p, _ in ranked],
                    "share": round(float(W[:, t].sum()) / total_w, 4)})
    out.sort(key=lambda x: -x["share"])
    return out


# ═══════════════ PHASE B — LINGUISTIC PIPELINE (spaCy) ═══════════════
SPACY_MODELS = {
    "en": ["en_core_web_lg", "en_core_web_md", "en_core_web_sm"],
    "es": ["es_core_news_lg", "es_core_news_md", "es_core_news_sm"],
    "fr": ["fr_core_news_lg", "fr_core_news_md", "fr_core_news_sm"],
    "de": ["de_core_news_lg", "de_core_news_md", "de_core_news_sm"],
    "it": ["it_core_news_lg", "it_core_news_md", "it_core_news_sm"],
    "pt": ["pt_core_news_lg", "pt_core_news_md", "pt_core_news_sm"],
}
LANG_HINTS = {
    "en": {"the", "and", "of", "to", "was", "that", "with", "his", "her", "for"},
    "es": {"el", "la", "de", "que", "y", "en", "los", "las", "un", "una", "por", "con", "su"},
    "fr": {"le", "la", "les", "des", "et", "est", "une", "que", "dans", "pour", "qui", "pas"},
    "de": {"der", "die", "das", "und", "ist", "nicht", "ein", "eine", "mit", "den", "zu", "von"},
    "it": {"il", "di", "che", "e", "la", "per", "un", "una", "non", "sono", "con", "gli"},
    "pt": {"o", "a", "de", "que", "e", "do", "da", "em", "um", "uma", "para", "com", "os", "não"},
}
CONTENT_POS = {"NOUN", "PROPN", "VERB", "ADJ"}
ENT_MAP = {"PERSON": "PERSON", "PER": "PERSON", "ORG": "ORG", "GPE": "GPE", "LOC": "LOC",
           "NORP": "NORP", "FAC": "FAC", "EVENT": "EVENT", "MISC": "MISC"}
_pipelines = {}
_nlp_lock = threading.Lock()


def installed_models():
    out = {}
    for lang, names in SPACY_MODELS.items():
        for n in names:
            if has(n):
                out[lang] = n
                break
    return out


def choose_lang(requested, sample):
    models = installed_models()
    if requested and requested != "auto":
        if requested not in SPACY_MODELS:
            raise ValueError("Unsupported language: %s" % requested)
        if requested not in models:
            raise MissingDep("No spaCy model for '%s'. Run:  python3 -m spacy download %s"
                             % (requested, SPACY_MODELS[requested][-1]))
        return requested
    if not models:
        raise MissingDep("No spaCy language model installed. Run:  python3 -m spacy download en_core_web_sm")
    if len(models) == 1:
        return next(iter(models))
    words = Counter(re.findall(r"[^\W\d_]+", sample[:20000].lower()))
    scores = {l: sum(words[w] for w in LANG_HINTS[l]) for l in models}
    return max(scores, key=scores.get)


def get_pipeline(model):
    if model not in _pipelines:
        import spacy
        p = spacy.load(model)
        p.max_length = 2000000
        _pipelines[model] = p
    return _pipelines[model]


def clean_ent(s):
    s = re.sub(r"\s+", " ", s).strip(" \t.,;:!?\"“”‘’()[]—-")
    return re.sub(r"[’']s$", "", s)


def nlp_process(paragraphs, lang="auto", mode="content", want_ents=False):
    """Per paragraph: lemma list ('' marks a dropped token so word positions stay true),
    sentence count, surface forms per lemma, and named entities."""
    if not has("spacy"):
        raise MissingDep("Linguistic analysis needs:  pip install spacy")
    paragraphs = [str(p) for p in paragraphs]
    lang = choose_lang(lang, " ".join(paragraphs[:40]))
    model = installed_models()[lang]
    t0 = time.time()
    tokens, forms, surf, ents, sentences = [], {}, Counter(), {}, 0
    with _nlp_lock:
        nlp = get_pipeline(model)
        disable = ["ner"] if (not want_ents and "ner" in nlp.pipe_names) else []
        for i, doc in enumerate(nlp.pipe(paragraphs, batch_size=32, disable=disable)):
            row = []
            for t in doc:
                if not t.is_alpha or len(t.text) < 2:
                    continue
                surf[t.text] += 1
                if mode == "content" and (t.is_stop or t.pos_ not in CONTENT_POS):
                    row.append("")
                    continue
                lem = (t.lemma_ or t.text).lower()
                if not lem.replace("'", "").isalpha():
                    lem = t.text.lower()
                row.append(lem)
                low = t.text.lower()
                if low != lem:
                    s = forms.setdefault(lem, set())
                    if len(s) < 8:
                        s.add(low)
            tokens.append(row)
            if doc.has_annotation("SENT_START"):
                sentences += sum(1 for _ in doc.sents)
            else:
                sentences += max(1, len(re.findall(r"[.!?]+", doc.text)))
            if want_ents:
                for e in doc.ents:
                    label = ENT_MAP.get(e.label_)
                    txt = clean_ent(e.text)
                    if not label or len(txt) < 2:
                        continue
                    rec = ents.setdefault((label, txt), {"text": txt, "label": label, "count": 0, "paras": set()})
                    rec["count"] += 1
                    rec["paras"].add(i)
    out_ents = []
    for rec in sorted(ents.values(), key=lambda r: -r["count"])[:500]:
        txt = rec["text"]
        lower = surf.get(txt.lower(), 0) if (" " not in txt and txt != txt.lower()) else 0
        out_ents.append({"text": txt, "label": rec["label"], "count": rec["count"],
                         "lower": lower, "paras": sorted(rec["paras"])})
    return {"lang": lang, "model": model, "tokens": tokens, "sentences": sentences,
            "forms": {k: sorted(v) for k, v in forms.items()}, "entities": out_ents,
            "seconds": round(time.time() - t0, 1)}


# ═══════════════ PHASE D — CHARACTER ALIAS CLUSTERING ═══════════════
M_TITLES = {"mr", "mister", "sir", "lord", "monsieur", "herr", "señor", "senor", "don", "signor",
            "king", "prince", "duke", "count", "baron", "father", "uncle"}
F_TITLES = {"mrs", "ms", "miss", "lady", "madame", "madam", "mme", "mlle", "frau", "señora", "senora",
            "doña", "dona", "signora", "queen", "princess", "duchess", "countess", "baroness",
            "mother", "aunt"}
N_TITLES = {"dr", "doctor", "prof", "professor", "captain", "colonel", "major", "general", "saint",
            "st", "reverend", "rev", "sergeant", "inspector", "judge"}


def split_title(name):
    core, g, title = [], None, None
    for t in name.split():
        k = t.lower().strip(".")
        if k in M_TITLES:
            g, title = "m", title or k
        elif k in F_TITLES:
            g, title = "f", title or k
        elif k in N_TITLES:
            title = title or k
        else:
            core.append(t)
    return core, g, title


def cluster_characters(entities, min_count=3):
    """Group PERSON mentions into characters by name parts and titles.
    Ambiguous short names (a bare surname shared by several people) stay separate and are flagged,
    so a later LLM step can decide with evidence instead of us guessing."""
    items = []
    for e in entities:
        if e.get("label") != "PERSON":
            continue
        core, g, title = split_title(e["text"])
        if not core:
            continue
        count = int(e.get("count", 0))
        # a lone capitalised word that mostly appears lowercase ('Will', 'Mark') is probably noise
        if len(core) == 1 and title is None and int(e.get("lower", 0)) > count and count < 3 * min_count:
            continue
        items.append({"text": e["text"], "disp": " ".join(core), "core": [c.lower() for c in core],
                      "g": g, "title": title, "count": count, "paras": set(e.get("paras", []))})
    items.sort(key=lambda x: (-len(x["core"]), -x["count"]))

    clusters = []

    def compat(c, g):
        return g is None or c["g"] is None or c["g"] == g

    def add(c, it):
        c["names"][it["text"]] = c["names"].get(it["text"], 0) + it["count"]
        c["paras"] |= it["paras"]
        c["tokens"] |= set(it["core"])
        if c["g"] is None:
            c["g"] = it["g"]

    def new(it, ambiguous=False, candidates=None):
        c = {"canon": it["disp"], "core": it["core"], "g": it["g"], "title": it["title"],
             "names": {}, "paras": set(), "tokens": set(),
             "ambiguous": ambiguous, "candidates": candidates or []}
        add(c, it)
        clusters.append(c)

    for it in items:
        core = it["core"]
        if len(core) >= 2:
            target = next((c for c in clusters if len(c["core"]) >= 2 and compat(c, it["g"]) and
                           (set(core) <= set(c["core"]) or set(c["core"]) <= set(core) or
                            (core[0] == c["core"][0] and core[-1] == c["core"][-1]))), None)
            if target:
                add(target, it)
            else:
                new(it)
        else:
            tok = core[0]
            multi = [c for c in clusters if len(c["core"]) >= 2 and tok in c["tokens"] and compat(c, it["g"])]
            if len(multi) == 1:
                add(multi[0], it)
            else:
                same = next((c for c in clusters if c["core"] == core and compat(c, it["g"]) and
                             (c["title"] == it["title"] or c["title"] is None or it["title"] is None)), None)
                if same:
                    add(same, it)
                else:
                    new(it, ambiguous=len(multi) > 1, candidates=[m["canon"] for m in multi])

    out = []
    for c in clusters:
        total = sum(c["names"].values())
        if total < min_count:
            continue
        names = sorted(c["names"].items(), key=lambda kv: -kv[1])
        canon = c["canon"] if len(c["core"]) > 1 else names[0][0]
        out.append({"canonical": canon, "aliases": [{"text": t, "count": n} for t, n in names],
                    "count": total, "paras": sorted(c["paras"]), "tokens": sorted(c["tokens"]),
                    "ambiguous": c["ambiguous"], "candidates": c["candidates"], "gender": c["g"]})
    out.sort(key=lambda x: -x["count"])
    out = out[:40]
    seen = {}
    for i, c in enumerate(out, 1):
        c["id"] = i
        n = seen.get(c["canonical"], 0) + 1
        seen[c["canonical"]] = n
        if n > 1:
            c["canonical"] += " (%d)" % n
    return out


# ═══════════════ OLLAMA + CACHED LLM ═══════════════
def ollama_status():
    try:
        with urllib.request.urlopen(OLLAMA_URL + "/api/tags", timeout=1.5) as r:
            data = json.loads(r.read())
        return {"up": True, "models": [m.get("name", "") for m in data.get("models", [])]}
    except Exception:
        return {"up": False, "models": []}


def ollama_generate(model, prompt, as_json, num_ctx):
    body = {"model": model, "prompt": prompt, "stream": False,
            "options": {"temperature": 0, "num_ctx": num_ctx}}
    if as_json:
        body["format"] = "json"
    req = urllib.request.Request(OLLAMA_URL + "/api/generate",
                                 data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get("error", "")
        except Exception:
            msg = str(e)
        if "not found" in msg.lower():
            msg = "Model '%s' is not installed. Run: ollama pull %s" % (model, model)
        raise LLMError(msg or "Ollama returned an error")
    except urllib.error.URLError:
        raise LLMError("Ollama is not running. Start it with: ollama serve")
    except (TimeoutError, socket.timeout):
        raise LLMError("The model took too long to answer")
    return THINK_RE.sub("", data.get("response", "")).strip()


def llm_cached(p):
    task = p.get("task", "")
    model = p.get("model", "llama3.1:8b")
    prompt = p.get("prompt", "")
    as_json = bool(p.get("json"))
    version = str(p.get("version", "1"))
    key = hashlib.sha256(("%s|%s|%s|%s|%s" % (version, model, task, as_json, prompt))
                         .encode("utf-8")).hexdigest()
    row = run_sql("SELECT response FROM llm_cache WHERE key=?", (key,), fetch=True)
    if row:
        return {"response": row[0]["response"], "cached": True}
    text = ollama_generate(model, prompt, as_json, int(p.get("num_ctx", 8192)))
    if text:
        run_sql("INSERT OR REPLACE INTO llm_cache VALUES (?,?,?,?,?,?)",
                (key, task, model, version, text, time.time()))
    return {"response": text, "cached": False}


def capabilities():
    models = installed_models() if has("spacy") else {}
    return {
        "version": 2,
        "python": sys.version.split()[0],
        "parse": {"txt": True, "md": True, "csv": True, "html": True,
                  "pdf": has("pypdf"), "docx": has("docx")},
        "topics": has("sklearn"),
        "nlp": {"spacy": bool(models), "installed": has("spacy"), "models": models},
        "store": True,
        "memory": lexia_memory.caps() if lexia_memory else {"available": False},
        "ollama": ollama_status(),
    }


# ═══════════════ HTTP HANDLER ═══════════════
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if self.path.startswith("/api/"):
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        if n > MAX_BODY:
            raise ValueError("File too large (max 100 MB)")
        return self.rfile.read(n)

    def _guard(self, fn):
        try:
            return fn()
        except MissingDep as e:
            return self._json({"error": str(e)}, 501)
        except LLMError as e:
            return self._json({"error": str(e)}, 502)
        except ValueError as e:
            return self._json({"error": str(e)}, 400)
        except Exception as e:
            traceback.print_exc()
            return self._json({"error": "Server error: %s" % e}, 500)

    def _mem(self, method, path, qs, body):
        status, obj = lexia_memory.route(method, path, qs, body)
        return self._json(obj, status)

    def do_OPTIONS(self):
        self.send_response(200); self.end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)
        if lexia_memory and u.path.startswith("/api/memory/"):
            return self._guard(lambda: self._mem("GET", u.path, qs, b""))
        if u.path == "/api/capabilities":
            return self._guard(lambda: self._json(capabilities()))
        if u.path == "/api/annotations":
            def go():
                rows = run_sql("SELECT * FROM annotations WHERE project=? ORDER BY created_at",
                               (qs.get("project", ["default"])[0],), fetch=True)
                self._json({"annotations": rows})
            return self._guard(go)
        return super().do_GET()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)

        def go():
            if lexia_memory and u.path.startswith("/api/memory/"):
                return self._mem("POST", u.path, qs, self._body())
            if u.path == "/api/parse":
                name = qs.get("filename", ["file.txt"])[0]
                text, pages = parse_file(name, self._body())
                return self._json({"text": text, "name": name, "pages": pages})
            if u.path == "/api/llm":
                return self._json(llm_cached(json.loads(self._body() or b"{}")))
            if u.path == "/api/topics":
                p = json.loads(self._body() or b"{}")
                return self._json({"topics": topics_nmf(p.get("paragraphs", []),
                                                        p.get("stopwords", []), p.get("k"))})
            if u.path == "/api/nlp":
                p = json.loads(self._body() or b"{}")
                paras = p.get("paragraphs", [])
                if not isinstance(paras, list) or not paras:
                    raise ValueError("No paragraphs to analyse")
                return self._json(nlp_process(paras, p.get("lang", "auto"),
                                              p.get("mode", "content"), bool(p.get("entities"))))
            if u.path == "/api/characters":
                p = json.loads(self._body() or b"{}")
                return self._json({"characters": cluster_characters(
                    p.get("entities", []), int(p.get("min_count", 3)))})
            if u.path == "/api/annotations":
                a = json.loads(self._body() or b"{}")
                run_sql("INSERT OR REPLACE INTO annotations VALUES (?,?,?,?,?,?,?)",
                        (a["id"], a.get("project", "default"), a.get("source", ""),
                         int(a.get("paraIdx", 0)), a.get("quote", ""), a.get("note", ""),
                         a.get("createdAt") or time.strftime("%Y-%m-%dT%H:%M:%S")))
                return self._json({"ok": True})
            if u.path == "/api/cache/clear":
                run_sql("DELETE FROM llm_cache")
                return self._json({"ok": True})
            return self.send_error(404)
        return self._guard(go)

    def do_DELETE(self):
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)

        def go():
            if lexia_memory and u.path.startswith("/api/memory/"):
                return self._mem("DELETE", u.path, qs, b"")
            if u.path == "/api/annotations" and "id" in qs:
                run_sql("DELETE FROM annotations WHERE id=?", (qs["id"][0],))
                return self._json({"ok": True})
            return self.send_error(404)
        return self._guard(go)


def main():
    os.chdir(BASE)
    init_db()
    if lexia_memory:
        lexia_memory.init(DB_PATH, OLLAMA_URL)
    c = capabilities()
    print("─" * 52)
    print("Lexia running at http://localhost:%d" % PORT)
    print("  PDF: %s | Word: %s | HTML: yes | Topics: %s"
          % ("yes" if c["parse"]["pdf"] else "no (pip install pypdf)",
             "yes" if c["parse"]["docx"] else "no (pip install python-docx)",
             "yes" if c["topics"] else "no (pip install scikit-learn)"))
    nl = c["nlp"]
    if nl["spacy"]:
        print("  spaCy: " + ", ".join("%s=%s" % kv for kv in nl["models"].items()))
    elif nl["installed"]:
        print("  spaCy: installed, but no language model (python3 -m spacy download en_core_web_sm)")
    else:
        print("  spaCy: no (pip install spacy)")
    if lexia_memory:
        print("  Memory add-on: yes" + (" (numpy)" if lexia_memory.np else " (no numpy: slower search)"))
    else:
        print("  Memory add-on: no")
    if c["ollama"]["up"]:
        print("  Ollama: up, models: " + ", ".join(c["ollama"]["models"]))
    else:
        print("  Ollama: NOT running (start it with: ollama serve)")
    print("  Data folder: " + DATA_DIR)
    print("─" * 52)
    if not os.environ.get("LEXIA_NO_BROWSER"):
        threading.Timer(1.0, lambda: webbrowser.open("http://localhost:%d" % PORT)).start()
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        httpd.daemon_threads = True
        httpd.serve_forever()


if __name__ == "__main__":
    main()
