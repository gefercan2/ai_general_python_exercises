# Customization Guide

Read this when the user wants to tune the output of `analyze_corpus.py` or
`build_graph.py`. Don't hardcode fixes into the scripts — these are meant
to be adjusted per-run via flags or by editing `stopwords.txt`.

## Keyword quality is off (too generic / too niche)

- **Too many generic words** (e.g. "however", "different"): add them to
  `references/stopwords.txt`, one per line, then re-run Phase 2.
- **Too few keywords per document**: raise `--top-n` (default 12).
- **Very short/noisy tokens surviving** (e.g. "th", "ing"): raise
  `--min-word-len` (default 4).

## Graph is too sparse (few/no links between documents)

- Lower `--min-shared-keywords` (default 2) — try 1 for small or diverse corpora.
- Consider raising `--top-n` in Phase 2 first, since more keywords per doc
  means more chances for overlap.

## Graph is too dense (everything links to everything)

- Raise `--min-shared-keywords` (try 3-4).
- Lower `--top-n` in Phase 2 so only the strongest terms per doc are kept.

## Dates aren't being found

The date extractor (`extract_dates` in `analyze_corpus.py`) looks for:
- Year ranges: `1518-1594`, `1518–1594` (en dash also matches)
- Single 4-digit years between 1000-2049

It does NOT parse full dates (e.g. "March 3, 1994") or non-Gregorian
formats. If the user's documents use a different date format, this is a
script edit, not a flag — regenerate `DATE_RANGE_RE` / `SINGLE_YEAR_RE` in
`analyze_corpus.py` to match their format before re-running.

## Citations aren't being found

The citation extractor matches common academic patterns: `(Smith, 2020)`,
`Smith (2020)`, `(Smith and Jones, 2019)`, `(Smith et al., 2021)`. Other
citation styles (footnotes, numbered `[1]`, Chicago full notes) will not
be caught — flag this to the user rather than silently returning nothing.

## Re-running a single phase

Each phase reads/writes its own JSON file, so you can re-run just one:
- Tweak stopwords/top-n → only re-run `analyze_corpus.py` and `build_graph.py`
  (no need to re-extract text)
- Tweak `--min-shared-keywords` → only re-run `build_graph.py`
