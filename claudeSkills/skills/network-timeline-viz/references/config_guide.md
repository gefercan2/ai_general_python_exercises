# Config Guide — network-timeline-viz

Pass a JSON file via `--config` to override any of these defaults. You
only need to include the keys you want to change — the generator merges
your config on top of the defaults below (deep merge, one level).

## Default config

```json
{
  "title": "Network & Timeline",
  "colors": {
    "pdf": "#5fb3a3",
    "md": "#d9a441",
    "txt": "#8b93a7",
    "default": "#5f8fd9"
  },
  "selectedColor": "#e85f5f",
  "timeline": {
    "tickInterval": 25,
    "padding": 20
  },
  "network": {
    "chargeStrength": -220,
    "linkDistance": 90,
    "nodeRadiusMin": 6,
    "nodeRadiusMax": 18
  }
}
```

## Field reference

| Key | Effect |
|---|---|
| `title` | Page `<title>` and header text |
| `colors.<type>` | Fill color for nodes of that `type` (matches the `type` field on each node — e.g. `md`, `pdf`, `txt`, or any custom category). Add new keys for custom types. |
| `colors.default` | Fallback color for any node `type` not listed |
| `selectedColor` | Color used for the highlighted/selected node and its matching timeline arc — defaults to red per the "arc turns red on selection" convention |
| `timeline.tickInterval` | Years between axis tick marks (e.g. `25` → ticks at ...1400, 1425, 1450...) |
| `timeline.padding` | Years of blank space before the earliest date and after the latest, so markers aren't flush against the chart edge |
| `network.chargeStrength` | Force-simulation repulsion between nodes. More negative = more spread out. Typical range: -400 (very spread) to -100 (tight cluster) |
| `network.linkDistance` | Target length of links in pixels. Higher = more spread out |
| `network.nodeRadiusMin` / `nodeRadiusMax` | Node circle size range — nodes are sized by `word_count` (or `citation_count` if present), scaled between these two values |
| `layout.show_timeline` | Set to `false` to hide the timeline chart entirely and let the network fill the full height. Default (unset/`true`) shows both. |

## Removing the timeline entirely

Pass `{"layout": {"show_timeline": false}}` via `--config` — no code editing
needed, and it survives regeneration:

```bash
echo '{"layout":{"show_timeline":false}}' > no-timeline.json
python3 scripts/generate_viz.py graph_data.json output.html --config no-timeline.json
```

## Common requests

**"Nodes are too spread out / too clustered"**
→ Adjust `network.chargeStrength` (less negative = tighter) and/or `network.linkDistance`.

**"I want different colors"**
→ Edit the `colors` map. Any node `type` not listed falls back to `colors.default`.

**"The timeline only shows part of the date range"**
→ Increase `timeline.padding`, or check that `graph_data.json`'s `timeline`
array actually contains the entries you expect (re-run `corpus-analyzer`
with a lower `--min-shared-keywords` won't help here — that's a different
skill's concern; the timeline just reflects whatever `start`/`end` values
are already in the input JSON).

**"I want a category legend that isn't file type"**
→ The legend is generated from whatever `type` values exist on the nodes.
If you want to legend by something else (e.g. topic cluster instead of
file type), relabel each node's `type` field in `graph_data.json` before
running this skill — the generator doesn't compute categories itself.

**"Node size should reflect something else"**
→ Currently sized by `word_count`, falling back to `citation_count` if
`word_count` is absent/zero. To change the sizing field, this requires
editing `assets/template.html`'s `sizeScale` domain accessor directly —
not exposed as a config flag, since it needs a matching field on every node.
