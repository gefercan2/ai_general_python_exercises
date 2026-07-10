---
name: corpus-analyzer
description: |
  Extracts topics, keywords, dates/timelines, citations, and cross-document
  relationships from a collection of PDF, TXT, or MD files, and outputs
  structured JSON (corpus_analysis.json, graph_data.json, metadata.json)
  that other tools or visualizations can consume. Use this skill whenever
  the user wants to: analyze a folder or set of documents for common themes,
  build a knowledge graph or network of documents, find what topics/authors/
  dates connect a set of papers or notes, prepare data for a dashboard or
  visualization, or turn a raw document dump into a structured, queryable
  dataset. Trigger this even if the user doesn't say "analyze" explicitly —
  phrases like "what do these documents have in common", "organize these
  notes", "find connections between these files", or "build a corpus" all
  qualify. This skill does NOT produce a visualization itself — pair it with
  a visualization skill (e.g. network-timeline-viz) for that.
---

# Corpus Analyzer

Turns a folder of raw documents into structured, analyzable data: keywords,
topics, dates, citations, and a relationship graph between documents.

This skill is intentionally **output-agnostic** — it produces clean JSON,
not a dashboard. That JSON is the input for downstream visualization skills
(e.g. `network-timeline-viz`) or for the user's own tools.

**No LLM involved.** All analysis (keyword extraction, date/citation
parsing, relationship scoring) is deterministic Python — TF-IDF and regex,
stdlib only. No API calls, no network access needed to run this skill, no
token cost. This means keyword/topic quality reflects word frequency and
co-occurrence, not semantic understanding — it won't know two differently-
worded phrases mean the same thing. If the user wants LLM-based semantic
tagging instead, that's a different (heavier, non-deterministic) workflow
this skill does not implement — say so rather than quietly approximating it.

## When to use this

- User has a folder of PDFs/TXT/MD files and wants themes, structure, or connections
- User wants a knowledge graph / network of how documents relate
- User wants dates or timelines extracted from a set of documents (bios, historical texts, articles)
- User wants "prep work" done before building a dashboard or wiki
- User explicitly names document analysis, corpus building, or topic extraction

## When NOT to use this

- User wants a finished chart/dashboard rendered — that's a visualization skill's job, use this skill first, then hand off
- Only a single, short document — just read and summarize it directly, this skill's overhead isn't worth it
- User wants sentiment analysis, translation, or Q&A over documents — different skill/approach entirely

## Workflow

Run the three phases below **in order**. Each phase is a standalone script
so you can re-run just one phase if the user wants to tweak parameters
without re-processing everything.

### Phase 1 — Ingest & Extract Text

```bash
python3 scripts/extract_text.py <input_dir> <output_dir>/manifest.json [--incremental]
```

- Walks `<input_dir>` recursively for `.pdf`, `.txt`, `.md` files
- Extracts raw text per file (pypdf for PDFs, direct read for TXT/MD, markdown stripped to plain text)
- Skips files it can't read and reports them at the end — check this output and tell the user if anything failed (e.g. scanned/image-only PDFs need OCR, which this script doesn't do)
- Writes `manifest.json`: one entry per document with `id`, `filename`, `filetype`, `text`, `word_count`

**`--incremental`**: if `manifest.json` already exists at the output path,
reuse entries for files whose size+mtime haven't changed, and only
re-extract files that are new or modified. Files no longer present in
`<input_dir>` are dropped from the manifest. Use this whenever the user
is re-running analysis on a folder they've added to or edited, rather
than re-extracting everything from scratch — for a large corpus this is
the difference between seconds and minutes. Report the new/changed/
reused/removed counts to the user so they know what actually happened.
Phases 2 and 3 always recompute from the full manifest (cheap, pure
counting — no benefit to making them incremental too).

**Before running:** confirm the input directory with the user if it's not obvious (don't assume `raw/` — ask or infer from context/uploads).

### Phase 2 — Analyze Content

```bash
python3 scripts/analyze_corpus.py <output_dir>/manifest.json <output_dir>/corpus_analysis.json [--top-n 12] [--min-word-len 4]
```

- Extracts top keywords per document using TF-IDF (stdlib only, no external deps)
- Extracts dates (years, year ranges, birth–death patterns like "1518–1594") per document
- Extracts likely citations (patterns like `(Author, Year)` or `Author (Year)`)
- Pulls a short excerpt (first ~40 words) per document for tooltip/preview use
- Writes `corpus_analysis.json`

**Review the output with the user** before Phase 3 if keyword quality looks off — the `--top-n` and stopword list (in `references/stopwords.txt`) are the two easiest knobs to turn. Common failure mode: too many generic words surviving (e.g. "however", "chapter") — extend the stopword list rather than hardcoding fixes into the script.

### Phase 3 — Build Relationship Graph

```bash
python3 scripts/build_graph.py <output_dir>/corpus_analysis.json <output_dir>/graph_data.json [--min-shared-keywords 2]
```

- Creates one **node** per document, carrying its metadata (title, type, top keywords, dates, excerpt)
- Creates **links** between documents that share at least `--min-shared-keywords` top keywords (default 2), weighted by overlap strength
- If dates were found, also emits a `timeline` array of `{id, label, start, end}` entries ready for a timeline visualization
- Writes `graph_data.json` — this is the file a visualization skill consumes

## Output Files (final deliverables)

| File | Contents |
|---|---|
| `manifest.json` | Raw extracted text per document (intermediate — not usually shown to user) |
| `corpus_analysis.json` | Per-document keywords, dates, citations, excerpt |
| `graph_data.json` | `{ nodes: [...], links: [...], timeline: [...] }` — ready for visualization |

Present `corpus_analysis.json` and `graph_data.json` to the user as the deliverables. Briefly summarize what was found (number of documents, top recurring themes, date range if any, strongest connections) in plain language — don't just dump JSON.

## Customization Knobs

All in `references/config_guide.md` — read it if the user asks to tune results:
- Stopword list (`references/stopwords.txt`)
- `--top-n`: how many keywords per document
- `--min-shared-keywords`: how aggressively documents get linked (lower = denser graph)
- `--min-word-len`: filters out short/noise tokens

## Edge Cases

- **Scanned PDFs (no extractable text):** `extract_text.py` will report zero/near-zero word count. Flag this to the user — OCR is out of scope for this skill.
- **Very small corpus (1-2 docs):** Graph-building will produce few/no links — that's expected, tell the user rather than treating it as a bug.
- **No dates found:** `timeline` array in `graph_data.json` will just be empty — downstream viz should handle that gracefully.
- **Mixed languages:** Keyword extraction is not language-aware; quality will degrade on non-English text. Mention this if you detect it.

## Handoff to Visualization

Once `graph_data.json` exists, if the user wants it visualized, that's the
`network-timeline-viz` skill's job (or the user's own tooling). Don't build
HTML/D3 output as part of this skill — keep the boundary clean.
