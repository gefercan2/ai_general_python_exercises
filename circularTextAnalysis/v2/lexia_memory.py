"""
lexia_memory.py — Lexia phases F + G. Optional: delete this file and run.py works without it.
  F: embeddings via Ollama, passage index in SQLite, similarity search, document similarity.
  G: feedback memory (accept / edit / reject): remembered edits and few-shot examples.
"""
import array, hashlib, json, math, re, socket, sqlite3, threading, time, traceback
import urllib.error, urllib.request, uuid
from contextlib import closing

try:
    import numpy as np
except Exception:
    np = None

CFG = {"db": None, "ollama": "http://localhost:11434"}
DEFAULT_MODEL = "nomic-embed-text"
MAX_WORDS, MIN_WORDS, BATCH = 180, 8, 16
FEEDBACK_KEEP = 500            # newest feedback rows kept per task
_ver = [0]                     # bumped whenever the index changes (invalidates the matrix cache)
_mcache, _qcache, _jobs = {}, {}, {}
_embed_lock = threading.Lock() # one indexing job at a time


class MemError(Exception):
    pass


# ───────────── storage ─────────────
def _conn():
    con = sqlite3.connect(CFG["db"], timeout=30)
    con.row_factory = sqlite3.Row
    return con


def _q(sql, args=(), fetch=False):
    with closing(_conn()) as con:
        cur = con.execute(sql, args)
        rows = [dict(r) for r in cur.fetchall()] if fetch else None
        con.commit()
        return rows


def init(db_path, ollama_url):
    CFG["db"], CFG["ollama"] = db_path, ollama_url
    with closing(_conn()) as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS mem_docs(
            project TEXT, name TEXT, doc_hash TEXT, model TEXT, n_chunks INTEGER, indexed_at REAL,
            PRIMARY KEY(project, name, model));
        CREATE TABLE IF NOT EXISTS mem_chunks(
            id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT, kind TEXT, doc TEXT, model TEXT,
            para_idx INTEGER, ref TEXT, text TEXT, extra TEXT, dim INTEGER, vec BLOB);
        CREATE INDEX IF NOT EXISTS ix_mem_chunks ON mem_chunks(project, model, kind, doc);
        CREATE TABLE IF NOT EXISTS mem_feedback(
            id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT, task TEXT, ihash TEXT,
            input_text TEXT, output_text TEXT, final_text TEXT, action TEXT,
            model TEXT, dim INTEGER, vec BLOB, created_at REAL);
        CREATE INDEX IF NOT EXISTS ix_mem_fb ON mem_feedback(project, task, ihash);
        """)
        con.commit()


def caps():
    return {"available": True, "numpy": np is not None, "default_model": DEFAULT_MODEL}


# ───────────── embeddings (Ollama) ─────────────
def _post(path, body, timeout):
    req = urllib.request.Request(CFG["ollama"] + path, data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _http_msg(e):
    try:
        raw = e.read().decode("utf-8", "replace")
    except Exception:
        return str(e)
    try:
        return json.loads(raw).get("error", raw)
    except Exception:
        return raw


def _is_missing(msg):
    m = msg.lower()
    return "not found" in m and "model" in m


def _unit(v):
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def _pack(v):
    return array.array("f", v).tobytes()


def _unpack(b):
    a = array.array("f")
    a.frombytes(b)
    return a


def _prefix(model, kind):
    if "nomic" in model.lower():          # nomic models expect task prefixes
        return "search_query: " if kind == "query" else "search_document: "
    return ""


def embed(model, texts):
    """Unit-length vectors, one per text."""
    vecs = None
    try:
        vecs = _post("/api/embed", {"model": model, "input": texts}, 300).get("embeddings")
    except urllib.error.HTTPError as e:
        msg = _http_msg(e)
        if _is_missing(msg):
            raise MemError("Embedding model '%s' is not installed. Run: ollama pull %s" % (model, model))
        if e.code != 404:
            raise MemError(msg or "Ollama returned an error")
    except urllib.error.URLError:
        raise MemError("Ollama is not running. Start it with: ollama serve")
    except (TimeoutError, socket.timeout):
        raise MemError("The embedding model took too long to answer")
    if not vecs:                           # older Ollama without /api/embed
        vecs = []
        for t in texts:
            try:
                vecs.append(_post("/api/embeddings", {"model": model, "prompt": t}, 120).get("embedding") or [])
            except urllib.error.HTTPError as e:
                msg = _http_msg(e)
                if _is_missing(msg):
                    raise MemError("Embedding model '%s' is not installed. Run: ollama pull %s" % (model, model))
                raise MemError(msg or "Ollama returned an error")
            except urllib.error.URLError:
                raise MemError("Ollama is not running. Start it with: ollama serve")
    if len(vecs) != len(texts) or any(not v for v in vecs):
        raise MemError("No vectors returned (is '%s' an embedding model?)" % model)
    return [_unit(v) for v in vecs]


def _query_vec(model, text):
    key = (model, text)
    v = _qcache.get(key)
    if v is None:
        v = embed(model, [_prefix(model, "query") + text[:3000]])[0]
        if len(_qcache) >= 256:
            _qcache.clear()
        _qcache[key] = v
    return v


# ───────────── PHASE F: index ─────────────
def make_chunks(paragraphs):
    """(paragraph index, text) pieces of at most MAX_WORDS words; tiny paragraphs are skipped."""
    out = []
    for i, p in enumerate(paragraphs):
        text = re.sub(r"\s+", " ", str(p)).strip()
        n = len(text.split())
        if n < MIN_WORDS:
            continue
        if n <= MAX_WORDS:
            out.append((i, text))
            continue
        buf, count = [], 0
        for s in re.split(r"(?<=[.!?])\s+", text):
            w = len(s.split())
            if buf and count + w > MAX_WORDS:
                out.append((i, " ".join(buf)))
                buf, count = [], 0
            buf.append(s)
            count += w
        if buf and count >= MIN_WORDS:
            out.append((i, " ".join(buf)))
    return out


def start_index(p):
    project = p.get("project", "default")
    model = (p.get("model") or DEFAULT_MODEL).strip()
    name = str(p.get("name", "")).strip()
    paras = p.get("paragraphs")
    if not name or not isinstance(paras, list) or not paras:
        raise ValueError("A document name and its paragraphs are required")
    h = hashlib.sha256("\n\n".join(str(x) for x in paras).encode("utf-8")).hexdigest()
    row = _q("SELECT doc_hash FROM mem_docs WHERE project=? AND name=? AND model=?",
             (project, name, model), fetch=True)
    if row and row[0]["doc_hash"] == h:
        return {"job": None, "state": "done", "skipped": True}
    job = uuid.uuid4().hex[:12]
    if len(_jobs) > 50:
        for k in list(_jobs)[:25]:
            _jobs.pop(k, None)
    _jobs[job] = {"state": "queued", "done": 0, "total": 0, "error": None, "name": name}
    threading.Thread(target=_run_index, args=(job, project, name, model, paras, h), daemon=True).start()
    return {"job": job, "state": "queued"}


def _run_index(job, project, name, model, paras, h):
    st = _jobs[job]
    try:
        with _embed_lock:
            st["state"] = "running"
            chunks = make_chunks(paras)
            st["total"] = len(chunks)
            rows = []
            for i in range(0, len(chunks), BATCH):
                batch = chunks[i:i + BATCH]
                vecs = embed(model, [_prefix(model, "doc") + t[:3000] for _, t in batch])
                for (pi, t), v in zip(batch, vecs):
                    rows.append((project, "chunk", name, model, pi, None, t, None, len(v), _pack(v)))
                st["done"] = min(i + BATCH, len(chunks))
            with closing(_conn()) as con:      # written in one go: a failed job leaves no partial index
                con.execute("DELETE FROM mem_chunks WHERE project=? AND kind='chunk' AND doc=? AND model=?",
                            (project, name, model))
                con.executemany("INSERT INTO mem_chunks(project,kind,doc,model,para_idx,ref,text,extra,dim,vec) "
                                "VALUES (?,?,?,?,?,?,?,?,?,?)", rows)
                con.execute("INSERT OR REPLACE INTO mem_docs VALUES (?,?,?,?,?,?)",
                            (project, name, h, model, len(rows), time.time()))
                con.commit()
            _ver[0] += 1
            st["state"] = "done"
    except MemError as e:
        st["state"], st["error"] = "error", str(e)
    except Exception as e:
        traceback.print_exc()
        st["state"], st["error"] = "error", "Indexing failed: %s" % e


def _load(project, model, kind):
    ver = _ver[0]
    key = (project, model, kind)
    hit = _mcache.get(key)
    if hit and hit["ver"] == ver:
        return hit
    rows = _q("SELECT doc, para_idx, ref, text, extra, vec FROM mem_chunks "
              "WHERE project=? AND model=? AND kind=? ORDER BY id", (project, model, kind), fetch=True)
    meta = [{"doc": r["doc"], "para": r["para_idx"], "ref": r["ref"],
             "text": r["text"], "extra": r["extra"]} for r in rows]
    if np is not None and rows:
        mat = np.vstack([np.frombuffer(r["vec"], dtype=np.float32) for r in rows])
    else:
        mat = [_unpack(r["vec"]) for r in rows]
    hit = {"ver": ver, "meta": meta, "mat": mat}
    _mcache[key] = hit
    return hit


def _scores(mat, qv):
    if np is not None and not isinstance(mat, list):
        return (mat @ np.asarray(qv, dtype=np.float32)).tolist()
    return [sum(a * b for a, b in zip(row, qv)) for row in mat]


def search(p):
    project = p.get("project", "default")
    model = (p.get("model") or DEFAULT_MODEL).strip()
    query = re.sub(r"\s+", " ", str(p.get("query", ""))).strip()
    k = max(1, min(int(p.get("k", 4)), 20))
    min_score = float(p.get("min_score", 0.5))
    kinds = [x for x in (p.get("kinds") or ["chunk"]) if x in ("chunk", "note")]
    ex = p.get("exclude") or {}
    if len(query) < 12 or not kinds:
        return {"hits": [], "indexed": True}
    qv, indexed, best = None, False, {}
    for kind in kinds:
        data = _load(project, model, kind)
        if not data["meta"]:
            continue
        indexed = True
        if qv is None:
            qv = _query_vec(model, query)
        for m, s in zip(data["meta"], _scores(data["mat"], qv)):
            if s < min_score:
                continue
            if ex and m["doc"] == ex.get("doc") and \
                    abs(m["para"] - int(ex.get("para", -999))) <= int(ex.get("radius", 1)):
                continue                      # the passage itself and its neighbours
            key = (kind, m["doc"], m["para"], m["ref"])
            if key not in best or s > best[key]["score"]:
                best[key] = {"kind": kind, "doc": m["doc"], "para": m["para"], "ref": m["ref"],
                             "text": m["text"][:700], "extra": m["extra"], "score": round(float(s), 3)}
    hits = sorted(best.values(), key=lambda h: -h["score"])[:k]
    return {"hits": hits, "indexed": indexed}


def doc_similarity(p):
    project = p.get("project", "default")
    model = (p.get("model") or DEFAULT_MODEL).strip()
    names = set(p.get("names") or [])
    data = _load(project, model, "chunk")
    by = {}
    for i, m in enumerate(data["meta"]):
        if m["doc"] in names:
            by.setdefault(m["doc"], []).append(i)
    have = sorted(by)
    pairs = []
    if np is not None and not isinstance(data["mat"], list):
        sub = {}
        for d, idx in by.items():
            if len(idx) > 1500:
                idx = idx[::int(math.ceil(len(idx) / 1500.0))]
            sub[d] = data["mat"][idx]
        for i in range(len(have)):
            for j in range(i + 1, len(have)):
                S = sub[have[i]] @ sub[have[j]].T      # mean of each passage's best match, both ways
                pairs.append({"a": have[i], "b": have[j],
                              "score": round(float((S.max(axis=1).mean() + S.max(axis=0).mean()) / 2), 4)})
        method = "best-match"
    else:
        cents = {}
        for d, idx in by.items():
            rows = [data["mat"][i] for i in idx]
            cents[d] = _unit([sum(col) / len(rows) for col in zip(*rows)])
        for i in range(len(have)):
            for j in range(i + 1, len(have)):
                pairs.append({"a": have[i], "b": have[j],
                              "score": round(sum(x * y for x, y in zip(cents[have[i]], cents[have[j]])), 4)})
        method = "centroid"
    return {"pairs": pairs, "method": method, "missing": [n for n in names if n not in by]}


def sync_notes(p):
    """Embed annotations that are not in the index yet (idempotent)."""
    project = p.get("project", "default")
    model = (p.get("model") or DEFAULT_MODEL).strip()
    have = {r["ref"] for r in _q("SELECT ref FROM mem_chunks WHERE project=? AND model=? AND kind='note'",
                                  (project, model), fetch=True)}
    todo = [n for n in (p.get("notes") or [])
            if n.get("id") and n["id"] not in have and len(str(n.get("quote", "")).strip()) >= 5]
    if not todo:
        return {"added": 0}
    rows = []
    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        texts = [_prefix(model, "doc") + (str(n.get("quote", "")) + "\n" + str(n.get("note", ""))).strip()[:3000]
                 for n in batch]
        for n, v in zip(batch, embed(model, texts)):
            rows.append((project, "note", str(n.get("source", "")), model, int(n.get("para", 0)), str(n["id"]),
                         str(n.get("quote", ""))[:1200], str(n.get("note", ""))[:1200], len(v), _pack(v)))
    with closing(_conn()) as con:
        con.executemany("INSERT INTO mem_chunks(project,kind,doc,model,para_idx,ref,text,extra,dim,vec) "
                        "VALUES (?,?,?,?,?,?,?,?,?,?)", rows)
        con.commit()
    _ver[0] += 1
    return {"added": len(rows)}


# ───────────── PHASE G: feedback memory ─────────────
def _ihash(task, text):
    norm = re.sub(r"\s+", " ", str(text)).strip().lower()
    return hashlib.sha256((task + "|" + norm).encode("utf-8")).hexdigest()[:32]


def _clip(s, n):
    s = s or ""
    return s if len(s) <= n else s[:n - 1].rstrip() + "…"


def record_feedback(p):
    project = p.get("project", "default")
    action = p.get("action")
    task = str(p.get("task", "")).strip()[:40]
    inp = str(p.get("input", "")).strip()
    out = str(p.get("output", "")).strip()
    fin = str(p.get("final", "")).strip()
    if action not in ("accept", "edit", "reject"):
        raise ValueError("action must be accept, edit or reject")
    if not task or not inp:
        raise ValueError("task and input are required")
    if action != "reject" and not fin:
        raise ValueError("final text is required")
    model, vec, dim = (p.get("model") or "").strip(), None, None
    if model and action != "reject":
        try:                                   # the vector only improves example ranking: optional
            v = embed(model, [_prefix(model, "doc") + inp[:3000]])[0]
            vec, dim = _pack(v), len(v)
        except MemError:
            model = ""
    _q("INSERT INTO mem_feedback(project,task,ihash,input_text,output_text,final_text,action,model,dim,vec,created_at) "
       "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
       (project, task, _ihash(task, inp), inp[:600], out[:600], fin[:600], action, model, dim, vec, time.time()))
    _q("DELETE FROM mem_feedback WHERE id IN (SELECT id FROM mem_feedback WHERE project=? AND task=? "
       "ORDER BY id DESC LIMIT -1 OFFSET ?)", (project, task, FEEDBACK_KEEP))
    return {"ok": True}


def get_override(p):
    """If the reader approved or edited an answer for exactly this input, return it."""
    rows = _q("SELECT action, final_text FROM mem_feedback WHERE project=? AND task=? AND ihash=? "
              "ORDER BY id DESC LIMIT 1",
              (p.get("project", "default"), p.get("task", ""), _ihash(p.get("task", ""), p.get("query", ""))),
              fetch=True)
    if rows and rows[0]["action"] in ("accept", "edit") and rows[0]["final_text"]:
        return {"text": rows[0]["final_text"], "edited": rows[0]["action"] == "edit"}
    return {"text": None}


def get_examples(p):
    project = p.get("project", "default")
    task = p.get("task", "")
    query = str(p.get("query", ""))
    model = (p.get("model") or "").strip()
    limit = max(1, min(int(p.get("limit", 3)), 5))
    ih = _ihash(task, query)
    rejected = [r["output_text"] for r in _q(
        "SELECT output_text FROM mem_feedback WHERE project=? AND task=? AND ihash=? AND action='reject' "
        "ORDER BY id DESC LIMIT 2", (project, task, ih), fetch=True) if r["output_text"]]
    rows = _q("SELECT ihash, input_text, final_text, action, model, dim, vec FROM mem_feedback "
              "WHERE project=? AND task=? AND action IN ('accept','edit') ORDER BY id DESC LIMIT 200",
              (project, task), fetch=True)
    rows = [r for r in rows if r["ihash"] != ih and r["final_text"]]
    qv = None
    if model and query and rows:
        try:
            qv = _query_vec(model, query)
        except MemError:
            qv = None
    scored, seen, n = [], set(), max(len(rows), 1)
    for i, r in enumerate(rows):                       # newest first
        if r["final_text"] in seen:
            continue
        seen.add(r["final_text"])
        sim = None
        if qv is not None and r["vec"] and r["model"] == model and r["dim"] == len(qv):
            sim = sum(a * b for a, b in zip(_unpack(r["vec"]), qv))
        score = (sim if sim is not None else 0.5) + 0.1 * (1 - i / n) + (0.08 if r["action"] == "edit" else 0)
        scored.append((score, r))
    scored.sort(key=lambda x: -x[0])
    return {"examples": [{"input": _clip(r["input_text"], 300), "output": _clip(r["final_text"], 300),
                          "edited": r["action"] == "edit"} for _, r in scored[:limit]],
            "rejected": [_clip(t, 300) for t in rejected]}


# ───────────── housekeeping ─────────────
def forget(p):
    project, what = p.get("project", "default"), p.get("what")
    if what == "index":
        _q("DELETE FROM mem_chunks WHERE project=? AND kind='chunk'", (project,))
        _q("DELETE FROM mem_docs WHERE project=?", (project,))
    elif what == "notes":
        _q("DELETE FROM mem_chunks WHERE project=? AND kind='note'", (project,))
    elif what == "feedback":
        _q("DELETE FROM mem_feedback WHERE project=?", (project,))
    else:
        raise ValueError("Unknown target: %s" % what)
    _ver[0] += 1
    return {"ok": True}


def status(project, model):
    docs = _q("SELECT name, n_chunks FROM mem_docs WHERE project=? AND model=? ORDER BY name",
              (project, model), fetch=True)
    notes = _q("SELECT COUNT(*) AS c FROM mem_chunks WHERE project=? AND model=? AND kind='note'",
               (project, model), fetch=True)[0]["c"]
    fb = _q("SELECT COUNT(*) AS c FROM mem_feedback WHERE project=?", (project,), fetch=True)[0]["c"]
    return {"docs": docs, "passages": sum(d["n_chunks"] or 0 for d in docs),
            "notes": notes, "feedback": fb, "numpy": np is not None}


def route(method, path, qs, body):
    """Returns (http status, json-able dict). Called from run.py for every /api/memory/ request."""
    try:
        one = lambda k, d="": qs.get(k, [d])[0]
        if method == "GET":
            if path == "/api/memory/status":
                return 200, status(one("project", "default"), one("model", DEFAULT_MODEL))
            if path == "/api/memory/job":
                j = _jobs.get(one("id"))
                if not j:
                    raise ValueError("Unknown indexing job (the server may have restarted)")
                return 200, j
        elif method == "POST":
            p = json.loads(body or b"{}")
            table = {"/api/memory/index": start_index, "/api/memory/search": search,
                     "/api/memory/similarity": doc_similarity, "/api/memory/notes/sync": sync_notes,
                     "/api/memory/feedback": record_feedback, "/api/memory/override": get_override,
                     "/api/memory/examples": get_examples, "/api/memory/forget": forget}
            if path in table:
                return 200, table[path](p)
        elif method == "DELETE":
            if path == "/api/memory/note":
                _q("DELETE FROM mem_chunks WHERE project=? AND kind='note' AND ref=?",
                   (one("project", "default"), one("id")))
                _ver[0] += 1
                return 200, {"ok": True}
        return 404, {"error": "Unknown memory route: " + path}
    except MemError as e:
        return 502, {"error": str(e)}
    except ValueError as e:
        return 400, {"error": str(e)}
    except Exception as e:
        traceback.print_exc()
        return 500, {"error": "Memory error: %s" % e}
