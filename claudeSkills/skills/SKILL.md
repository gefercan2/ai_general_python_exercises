---
name: corpus-explorer
description: |
  Orchestrates corpus-analyzer, network-timeline-viz, and text-structure-viz
  into ONE browsable, linked static site: a network diagram as the entry
  point, where clicking a document node drills into that document's own
  radial structure chart, which has a "Read full document" button and a
  "Back to network" link (browser Back also works — real hyperlinks).
  Use when the user wants to EXPLORE a folder of documents end-to-end, not
  just get raw data or a single chart. Trigger for "let me explore this
  folder," "build a site to browse these files," "click into each document
  from the network view," "select a folder and drill into documents," or
  anything describing overview + per-document drill-down together. If the
  user wants only one piece (just data, just one chart), use that
  individual skill instead — this skill's overhead isn't worth it then.
---

# Corpus Explorer (Orchestrator)

This skill does not duplicate any analysis or rendering logic — it runs
the other three skills' own scripts in sequence, then stitches their
outputs into a navigable folder of static HTML files:

```
output_dir/
├── index.html          ← network diagram (network-timeline-viz)
└── docs/
    ├── <doc-id-1>.html ← radial structure chart (text-structure-viz)
    ├── <doc-id-2>.html
    └── ...
```

Clicking a node in `index.html` navigates (same tab) to that document's
`docs/<id>.html`. Each document page has a "Read full document" button
(shows the raw text in a modal) and a "← Back to network" link. Because
these are real page navigations, the browser's native Back button also
works — no custom navigation code was needed for that part.

## When to use this vs. the individual skills

| User wants | Use |
|---|---|
| Just the extracted data (keywords, dates, graph JSON) | `corpus-analyzer` alone |
| Just one network/timeline chart | `corpus-analyzer` → `network-timeline-viz` |
| Just one document's structure chart | `text-structure-viz` alone |
| **Click through from overview into each document, with a way back** | **This skill** |

## Prerequisites — locate the sibling skills

This skill's own script only does the *linking* step — it needs the file
paths to the other three skills' scripts to actually run them. Before
starting, locate them. They're typically installed under a skills
directory such as `~/.claude/skills/<name>/` or a project's
`.claude/skills/<name>/`. Find them with:

```bash
find ~ -maxdepth 6 -iname "SKILL.md" 2>/dev/null | xargs grep -l "^name: corpus-analyzer$" 2>/dev/null
find ~ -maxdepth 6 -iname "SKILL.md" 2>/dev/null | xargs grep -l "^name: network-timeline-viz$" 2>/dev/null
find ~ -maxdepth 6 -iname "SKILL.md" 2>/dev/null | xargs grep -l "^name: text-structure-viz$" 2>/dev/null
```

Each result's directory is that skill's root — its scripts live at
`<that_dir>/scripts/`. If any are missing, tell the user which skill(s)
need to be installed before this one can run (don't try to reimplement
their logic here).

## Workflow

### Step 1 — Run corpus-analyzer (Phases 1–3)

```bash
python3 <corpus-analyzer>/scripts/extract_text.py <input_folder> <work_dir>/manifest.json
python3 <corpus-analyzer>/scripts/analyze_corpus.py <work_dir>/manifest.json <work_dir>/corpus_analysis.json
python3 <corpus-analyzer>/scripts/build_graph.py <work_dir>/corpus_analysis.json <work_dir>/graph_data.json
```

Follow `corpus-analyzer`'s own SKILL.md for parameter tuning if the
keyword/graph quality needs adjustment before proceeding.

### Step 2 — Run the linking step

```bash
python3 scripts/link_site.py \
  --input-dir <input_folder> \
  --manifest <work_dir>/manifest.json \
  --graph-data <work_dir>/graph_data.json \
  --output-dir <site_output_dir> \
  --network-viz-script <network-timeline-viz>/scripts/generate_viz.py \
  --prepare-structure-script <text-structure-viz>/scripts/prepare_structure.py \
  --generate-radial-script <text-structure-viz>/scripts/generate_radial_viz.py \
  --title "My Corpus"
```

This single script:
1. For every node in `graph_data.json`, locates its original source file
   (via `manifest.json`'s `relative_path`) and runs
   `prepare_structure.py --include-full-text` on it, then
   `generate_radial_viz.py --back-url ../index.html` to produce
   `output_dir/docs/<id>.html`
2. Adds a `detail_url: "docs/<id>.html"` field to each node in
   `graph_data.json` (in memory — doesn't touch the original file) and
   runs `generate_viz.py` on the result to produce `output_dir/index.html`
3. Prints a summary and the path to open

### Step 3 — Hand off

Tell the user to open `output_dir/index.html` in a browser. Mention:
- Click any node → drills into that document's structure chart
- "Read full document" button on each document page shows raw text
- Back button (browser's or the on-page link) returns to the network view

## Known Limitations

- Documents that failed text extraction in Step 1 (e.g. scanned PDFs)
  will have a network node but no meaningful radial chart — `link_site.py`
  still generates a page for them but flags this in its output; mention
  it to the user rather than silently shipping a broken-looking page.
- Regenerating after editing source documents means re-running the whole
  pipeline — there's no incremental/partial rebuild.
- This skill assumes all three sibling skills are already installed
  and discoverable; it will not install or fetch them.
