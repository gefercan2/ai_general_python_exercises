---
name: network-timeline-viz
description: |
  Generates a single self-contained HTML file with two linked D3.js
  visualizations: a force-directed network graph (draggable nodes, zoom,
  color-coded legend, tooltips) and a horizontal timeline/arc chart (birth
  death spans, ticks, red highlight arcs). Selecting a node in either view
  highlights the matching element in the other. Use this skill whenever the
  user wants a network diagram, a relationship graph, a timeline of dated
  entities (people, events, documents), or an "arc diagram" — especially
  after running the corpus-analyzer skill, whose graph_data.json is this
  skill's expected input. Trigger this for requests like "visualize these
  connections", "show a network graph of my documents", "build a timeline
  of these people/events", "make a D3 dashboard from this JSON", even if
  the user doesn't say "D3" or "network" explicitly — describing nodes,
  links, or dated entities that need visualizing is enough.
---

# Network + Timeline Visualization

Generates one self-contained `.html` file (D3.js loaded from CDN, no
build step, no server needed — just open it in a browser) containing:

1. **Network graph** (top) — force-directed, draggable nodes, zoom
   in/out, color-coded by type, click-to-pin tooltip
2. **Timeline** (bottom) — horizontal axis with tick marks, birth (circle)
   / death (square) markers joined by an arc per entity

Clicking a node in either chart highlights it in red in both, and dims
unrelated elements. This is a **template you hand to the user** — it's
built to be readable and re-styled, not a finished, branded product.

## When to use this

- User has `graph_data.json` from the `corpus-analyzer` skill and wants it visualized
- User wants a relationship/network diagram from any nodes+links dataset
- User wants a timeline of dated entities (historical figures, events, project milestones)
- User asks for "an arc diagram," "a D3 dashboard," or similar

## When NOT to use this

- User hasn't got structured node/link/date data yet — run `corpus-analyzer`
  (or otherwise produce a compatible JSON) first
- User wants a static chart (bar/line/pie) — that's a simpler `chart`
  visualization job, this skill's overhead isn't worth it
- User wants the concentric radial "text structure" visualization from the
  original spec (word-frequency belts, paragraph rings) — that's a
  separate, not-yet-built skill; don't try to force this one to do it

## Input Format

Expects a JSON file shaped like `corpus-analyzer`'s `graph_data.json`:

```json
{
  "nodes": [
    {"id": "abc123", "label": "tintoretto.md", "type": "md",
     "top_keywords": ["venetian", "painter"], "excerpt": "...", "word_count": 64}
  ],
  "links": [
    {"source": "abc123", "target": "def456", "shared_keywords": ["venetian"], "weight": 0.12}
  ],
  "timeline": [
    {"id": "abc123-date0", "doc_id": "abc123", "label": "tintoretto.md",
     "start": 1518, "end": 1594, "type": "range"}
  ]
}
```

If the user's data doesn't match this exactly (e.g. different field names,
or a hand-built dataset instead of `corpus-analyzer` output), either adapt
their JSON to this shape first, or tell them what's missing — don't guess
silently at field names.

`type: "single"` timeline entries (no `end`) render as a diamond marker
with no arc. `timeline` can be an empty array — the timeline chart will
just render axis and ticks with no entries; mention this to the user
rather than treating it as broken.

Optional per-node field: `"url"` — if present, the tooltip shows a
clickable link that opens in a new tab.

Optional per-node field: `"detail_url"` — if present, the tooltip shows an
"Open document view →" link that navigates in the **same tab** (relative
path, e.g. `docs/abc123.html`). This is how drill-down navigation works
when this skill is used as one stage of `corpus-explorer`'s multi-level
site. Not needed for standalone use.

## Workflow

### Step 1 — Validate input

Confirm the JSON has `nodes` (array) and `links` (array) at minimum;
`timeline` may be empty or absent — normalize a missing key to `[]`
before generating rather than failing.

### Step 2 — Generate the visualization

```bash
python3 scripts/generate_viz.py <graph_data.json> <output.html> [--title "My Corpus"] [--config <config.json>]
```

- Reads the graph JSON, merges any `--config` overrides with the defaults
  in `references/config_guide.md`, injects both into `assets/template.html`,
  and writes a single standalone HTML file.
- No network access is required to generate the file, but the output HTML
  itself loads D3 from a CDN (`unpkg.com`) — the user needs internet
  access when they *open* it in a browser.

### Step 3 — Hand off

Tell the user the output path and that they can just double-click / open
it in any browser — no server needed. Point them at
`references/config_guide.md` if they want to re-color, re-scale the
timeline, or change force-graph physics.

## Customization Knobs

See `references/config_guide.md` for the full list. The most commonly
requested tweaks:
- **Colors per node type** — `colors` map in config
- **Timeline year range / tick spacing** — `timeline.tickInterval`, auto-padding
- **Network physics** (how spread out / clustered nodes are) — `network.chargeStrength`, `network.linkDistance`
- **Selected/highlight color** — `selectedColor` (defaults to red per the arc-highlight convention)

## Known Limitations (tell the user, don't silently paper over)

- Large graphs (200+ nodes) will look cluttered — force layout doesn't
  scale gracefully past that without additional clustering, which this
  template doesn't implement.
- Timeline assumes years are on the Gregorian calendar and roughly
  1000–2049 — matches `corpus-analyzer`'s date extraction range.
- This is a template: production polish (custom fonts, animations,
  branding) is on the user or a follow-up design pass, not this skill's job.
