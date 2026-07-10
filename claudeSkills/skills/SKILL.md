---
name: text-structure-viz
description: |
  Generates a self-contained HTML file with a concentric radial
  visualization of a SINGLE document's internal structure: a center ring
  of top topic bubbles, a word-frequency cloud belt, a donut ring of
  paragraphs in reading order (headings marked distinctly), a radial track
  showing where key words occur across the document, and an optional
  citation ring. Includes a click-through "context reader" panel that
  shows full paragraph text. Use this skill when the user wants to
  visualize the internal structure/composition of one document (not
  relationships across many documents — for that use network-timeline-viz
  after corpus-analyzer). Trigger for requests like "show me the structure
  of this document," "radial chart of word frequency," "visualize
  paragraph flow," "concentric circles of this text," "word cloud with
  paragraph structure," even without the word "radial" — describing
  wanting to see how a single document is composed/organized is enough.
---

# Text Structure Visualization (Radial)

Generates one self-contained `.html` file (D3.js from CDN, no build step)
showing a single document's structure as concentric rings, center to
edge:

1. **Topic bubbles** (center) — top recurring terms, sized by frequency
2. **Word cloud belt** — broader set of frequent words, radial layout
3. **Paragraph donut** — one arc per paragraph in reading order, angle
   proportional to paragraph length, headings visually distinct
4. **Word-occurrence track** — dots marking where each top topic word
   appears, angularly aligned to its paragraph
5. **Citation ring** (optional, only if citations are found) — one mark
   per citation, aligned to its paragraph

Clicking a topic bubble highlights its occurrences in the word track and
opens a **context reader** panel with the source paragraph. Clicking any
paragraph or word dot opens the same reader. Zoom/pan is supported on the
whole chart.

## When to use this

- User wants to see the internal structure/composition of **one document**
- User wants word frequency + paragraph flow together, not as two separate charts
- User explicitly asks for a "radial" or "concentric" visualization of text

## When NOT to use this

- User wants relationships **across multiple documents** — use
  `corpus-analyzer` then `network-timeline-viz` instead
- User just wants a plain word cloud or bar chart of word frequency — this
  skill's overhead (paragraph structure, rings, reader panel) isn't
  warranted for that; a simpler `chart` visualization is a better fit
- Document is very short (a few sentences) — there's not enough structure
  to make the rings meaningful; say so rather than generating a sparse chart

## Workflow

### Step 1 — Prepare structural data

```bash
python3 scripts/prepare_structure.py <input_file> <output_structure.json> [--top-topics 10] [--word-cloud-size 30]
```

- Accepts `.txt`, `.md`, or `.pdf`. Unlike `corpus-analyzer`'s extraction,
  this **preserves paragraph boundaries** (required for the donut ring) —
  don't substitute `corpus-analyzer`'s manifest.json here, it flattens
  paragraphs into one string.
- Detects markdown headings (`#`, `##`, etc.) and marks those paragraphs
  as headings — they render as a distinct color and a wider gap in the
  paragraph ring.
- Computes top topic terms (frequency-based, stopword-filtered) with
  their co-occurring "related words" for tooltips.
- Locates every occurrence of each topic term, tagged with its paragraph
  index and nearby colocate words.
- Extracts citations per paragraph if present (same pattern as
  `corpus-analyzer`: `(Author, Year)` / `Author (Year)` style).
- Reports word/paragraph counts — **flag to the user if the document is
  very short** (e.g. under ~5 paragraphs or ~300 words); the visualization
  will look sparse and may not be worth generating.

### Step 2 — Generate the visualization

```bash
python3 scripts/generate_radial_viz.py <structure.json> <output.html> [--title "My Document"] [--config config.json]
```

- Injects the structure data and config into `assets/template.html` and
  writes a standalone HTML file.
- If `structure.json` has zero citations, the citation ring is simply
  omitted — mention this to the user rather than treating it as an error.
- Requires internet access only when the user *opens* the resulting HTML
  (D3 loads from a CDN), not during generation.

### Step 3 — Hand off

Tell the user the output path — open directly in a browser, no server
needed. Point to `references/config_guide.md` for recoloring, ring radii,
or how many topics/word-cloud terms to show.

## Known Limitations (tell the user, don't paper over)

- PDF paragraph detection is heuristic (based on blank-line patterns in
  extracted text) and less reliable than for `.txt`/`.md` — warn the user
  if a PDF's paragraph count looks unreasonably high or low compared to
  its visible structure.
- Word/topic frequency is not language-aware — quality degrades on
  non-English text.
- Designed for one document at a time. Don't try to feed it a whole
  corpus — that's `corpus-analyzer` + `network-timeline-viz`'s job.
