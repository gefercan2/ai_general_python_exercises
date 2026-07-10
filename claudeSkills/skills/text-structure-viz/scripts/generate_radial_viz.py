#!/usr/bin/env python3
"""
Generates a self-contained concentric radial visualization HTML from a
structure.json file (as produced by prepare_structure.py).

Usage:
    python3 generate_radial_viz.py <structure.json> <output.html> [--title "My Document"] [--config config.json]
"""
import sys
import os
import json
import re
import argparse
import copy

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_PATH = os.path.join(SCRIPT_DIR, "..", "assets", "template.html")

DEFAULT_CONFIG = {
    "title": "Document Structure",
    "colors": {
        "topic": "#d9a441",
        "paragraph": "#5f8fd9",
        "heading": "#7fc7ff",
        "word": "#5fb3a3",
        "citation": "#e0a458",
        "selected": "#e85f5f",
    },
    "radii": {
        "r1": 70,   # topic bubble cluster radius
        "r2": 100,  # paragraph donut inner radius (leaves room for word-cloud belt)
        "r3": 150,  # paragraph donut outer radius
        "r4": 190,  # word-occurrence track radius
        "r5": 220,  # citation ring radius
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


def load_structure(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    required = ["paragraphs", "topics", "word_track", "word_cloud", "citations"]
    for key in required:
        data.setdefault(key, [])
    return data


def validate_structure(data):
    warnings = []
    if not data["paragraphs"]:
        warnings.append("structure.json has zero paragraphs — the chart will render essentially empty.")
    if not data["topics"]:
        warnings.append("No topics found — the center bubble ring and word track will be empty.")
    if not data["citations"]:
        warnings.append("No citations found — the citation ring will be omitted (this is expected for non-academic text).")
    para_indices = set(p["index"] for p in data["paragraphs"])
    for occ in data["word_track"]:
        if occ.get("paragraph_index") not in para_indices:
            warnings.append(f"word_track entry references unknown paragraph_index {occ.get('paragraph_index')}")
            break  # one warning is enough, don't spam
    return warnings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("structure_path")
    parser.add_argument("output_path")
    parser.add_argument("--title", default=None)
    parser.add_argument("--config", default=None)
    parser.add_argument("--back-url", default=None,
                         help="Relative URL for a 'back' link in the header, e.g. '../index.html'. Omitted if not set.")
    args = parser.parse_args()

    data = load_structure(args.structure_path)
    for w in validate_structure(data):
        print(f"WARNING: {w}")

    config = copy.deepcopy(DEFAULT_CONFIG)
    if args.config:
        with open(args.config, "r", encoding="utf-8") as f:
            user_config = json.load(f)
        config = deep_merge(config, user_config)
    if args.title:
        config["title"] = args.title
    elif data.get("title"):
        config["title"] = data["title"]
    if args.back_url:
        config["back_url"] = args.back_url

    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        template = f.read()

    structure_json = json.dumps(data).replace("</", "<\\/")
    config_json = json.dumps(config).replace("</", "<\\/")

    template = re.sub(
        r"/\*__STRUCTURE_JSON__\*/.*?/\*__END_STRUCTURE_JSON__\*/",
        lambda m: structure_json,
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
    print(f"  {len(data['paragraphs'])} paragraphs, {len(data['topics'])} topics, "
          f"{len(data['word_track'])} word occurrences, {len(data['citations'])} citations")


if __name__ == "__main__":
    main()
