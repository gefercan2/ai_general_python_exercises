#!/usr/bin/env python3
"""
Generates a self-contained network+timeline HTML visualization from a
graph_data.json file (as produced by the corpus-analyzer skill).

Usage:
    python3 generate_viz.py <graph_data.json> <output.html> [--title "My Corpus"] [--config config.json]
"""
import sys
import os
import json
import argparse
import copy

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_PATH = os.path.join(SCRIPT_DIR, "..", "assets", "template.html")

DEFAULT_CONFIG = {
    "title": "Network & Timeline",
    "colors": {
        "pdf": "#5fb3a3",
        "md": "#d9a441",
        "txt": "#8b93a7",
        "default": "#5f8fd9",
    },
    "selectedColor": "#e85f5f",
    "timeline": {
        "tickInterval": 25,
        "padding": 20,
    },
    "network": {
        "chargeStrength": -220,
        "linkDistance": 90,
        "nodeRadiusMin": 6,
        "nodeRadiusMax": 18,
    },
}


def deep_merge(base, override):
    result = copy.deepcopy(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_graph_data(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if "nodes" not in data or "links" not in data:
        raise ValueError("graph_data.json must contain at least 'nodes' and 'links' arrays")
    data.setdefault("timeline", [])
    return data


def validate_graph_data(data):
    """Returns a list of warning strings — non-fatal issues to surface to the user."""
    warnings = []
    node_ids = set(n.get("id") for n in data["nodes"])
    if not data["nodes"]:
        warnings.append("graph_data.json has zero nodes — the network chart will render empty.")
    for n in data["nodes"]:
        if "id" not in n or "label" not in n:
            warnings.append(f"A node is missing 'id' or 'label': {n}")
    for l in data["links"]:
        s = l.get("source")
        t = l.get("target")
        if s not in node_ids or t not in node_ids:
            warnings.append(f"Link references unknown node id(s): source={s}, target={t}")
    if not data["timeline"]:
        warnings.append("No timeline entries found — timeline chart will show axis only, no markers.")
    else:
        for t in data["timeline"]:
            if t.get("doc_id") not in node_ids:
                warnings.append(f"Timeline entry '{t.get('id')}' has doc_id not present in nodes — it won't sync with network selection.")
    return warnings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("graph_data_path")
    parser.add_argument("output_path")
    parser.add_argument("--title", default=None)
    parser.add_argument("--config", default=None, help="Path to a JSON file overriding default config")
    args = parser.parse_args()

    graph_data = load_graph_data(args.graph_data_path)

    warnings = validate_graph_data(graph_data)
    for w in warnings:
        print(f"WARNING: {w}")

    config = copy.deepcopy(DEFAULT_CONFIG)
    if args.config:
        with open(args.config, "r", encoding="utf-8") as f:
            user_config = json.load(f)
        config = deep_merge(config, user_config)
    if args.title:
        config["title"] = args.title

    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        template = f.read()

    graph_json = json.dumps(graph_data)
    config_json = json.dumps(config)

    # Guard against literal "</script>" appearing inside document text (e.g. an
    # excerpt that happens to contain that substring), which would otherwise
    # prematurely close the <script> tag when embedded in the HTML.
    graph_json = graph_json.replace("</", "<\\/")
    config_json = config_json.replace("</", "<\\/")

    # Replace the placeholder blocks (including their default fallback values)
    # rather than doing a naive token swap, so the template stays valid
    # standalone HTML/JS even before generation (useful for hand-editing/testing).
    import re
    template = re.sub(
        r"/\*__GRAPH_DATA_JSON__\*/.*?/\*__END_GRAPH_DATA_JSON__\*/",
        lambda m: graph_json,
        template,
        flags=re.S,
    )
    template = re.sub(
        r"/\*__VIZ_CONFIG_JSON__\*/.*?/\*__END_VIZ_CONFIG_JSON__\*/",
        lambda m: config_json,
        template,
        flags=re.S,
    )
    template = template.replace("__PAGE_TITLE__", config["title"])

    os.makedirs(os.path.dirname(os.path.abspath(args.output_path)) or ".", exist_ok=True)
    with open(args.output_path, "w", encoding="utf-8") as f:
        f.write(template)

    print(f"Generated visualization -> {args.output_path}")
    print(f"  {len(graph_data['nodes'])} nodes, {len(graph_data['links'])} links, {len(graph_data['timeline'])} timeline entries")


if __name__ == "__main__":
    main()
