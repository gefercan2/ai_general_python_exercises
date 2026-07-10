#!/usr/bin/env python3
"""
Stitches corpus-analyzer + network-timeline-viz + text-structure-viz
outputs into one navigable static site:

  output_dir/index.html        (network diagram, from network-timeline-viz)
  output_dir/docs/<id>.html    (per-document radial chart, from text-structure-viz)

This script does not reimplement any analysis/rendering logic — it shells
out to the other skills' own scripts and only handles the wiring:
mapping node id -> source file, adding detail_url to nodes, adding
back_url to each document page.

Usage:
    python3 link_site.py \
      --input-dir <raw docs folder> \
      --manifest <manifest.json from corpus-analyzer> \
      --graph-data <graph_data.json from corpus-analyzer> \
      --output-dir <site output dir> \
      --network-viz-script <path to network-timeline-viz/scripts/generate_viz.py> \
      --prepare-structure-script <path to text-structure-viz/scripts/prepare_structure.py> \
      --generate-radial-script <path to text-structure-viz/scripts/generate_radial_viz.py> \
      [--title "My Corpus"]
"""
import sys
import os
import json
import argparse
import subprocess
import copy


def run(cmd, description):
    """Run a subprocess, streaming its output, and raise on failure."""
    print(f"  $ {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.stdout.strip():
        print("    " + result.stdout.strip().replace("\n", "\n    "))
    if result.returncode != 0:
        print(f"  FAILED: {description}")
        if result.stderr.strip():
            print("    " + result.stderr.strip().replace("\n", "\n    "))
        return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--graph-data", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--network-viz-script", required=True)
    parser.add_argument("--prepare-structure-script", required=True)
    parser.add_argument("--generate-radial-script", required=True)
    parser.add_argument("--title", default="Corpus Explorer")
    args = parser.parse_args()

    for path, name in [
        (args.manifest, "manifest"), (args.graph_data, "graph-data"),
        (args.network_viz_script, "network-viz-script"),
        (args.prepare_structure_script, "prepare-structure-script"),
        (args.generate_radial_script, "generate-radial-script"),
    ]:
        if not os.path.exists(path):
            print(f"ERROR: --{name} path does not exist: {path}")
            sys.exit(1)

    with open(args.manifest, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    with open(args.graph_data, "r", encoding="utf-8") as f:
        graph_data = json.load(f)

    id_to_relpath = {d["id"]: d["relative_path"] for d in manifest["documents"]}

    docs_dir = os.path.join(args.output_dir, "docs")
    work_dir = os.path.join(args.output_dir, "_work")
    os.makedirs(docs_dir, exist_ok=True)
    os.makedirs(work_dir, exist_ok=True)

    print(f"Generating {len(graph_data['nodes'])} document detail pages...")
    skipped = []
    for node in graph_data["nodes"]:
        node_id = node["id"]
        rel_path = id_to_relpath.get(node_id)
        if not rel_path:
            skipped.append((node.get("label", node_id), "no source file found in manifest"))
            continue

        source_path = os.path.join(args.input_dir, rel_path)
        structure_path = os.path.join(work_dir, f"{node_id}_structure.json")
        detail_html_path = os.path.join(docs_dir, f"{node_id}.html")

        print(f"- {node.get('label', node_id)}")
        ok = run([
            sys.executable, args.prepare_structure_script,
            source_path, structure_path, "--include-full-text",
        ], f"prepare_structure.py on {rel_path}")
        if not ok:
            skipped.append((node.get("label", node_id), "structure prep failed (see log above)"))
            continue

        ok = run([
            sys.executable, args.generate_radial_script,
            structure_path, detail_html_path,
            "--back-url", "../index.html",
            "--title", node.get("label", node_id),
        ], f"generate_radial_viz.py for {node_id}")
        if not ok:
            skipped.append((node.get("label", node_id), "radial viz generation failed (see log above)"))
            continue

        node["detail_url"] = f"docs/{node_id}.html"

    augmented_graph_path = os.path.join(work_dir, "graph_data_with_links.json")
    with open(augmented_graph_path, "w", encoding="utf-8") as f:
        json.dump(graph_data, f, indent=2)

    print("\nGenerating network overview (index.html)...")
    index_path = os.path.join(args.output_dir, "index.html")
    ok = run([
        sys.executable, args.network_viz_script,
        augmented_graph_path, index_path,
        "--title", args.title,
    ], "generate_viz.py for index.html")
    if not ok:
        print("ERROR: failed to generate the network overview — site is incomplete.")
        sys.exit(1)

    print(f"\nSite generated at: {args.output_dir}")
    print(f"Open {index_path} in a browser to start.")
    if skipped:
        print(f"\nWARNING: {len(skipped)} document(s) were skipped and have no detail page:")
        for label, reason in skipped:
            print(f"  - {label}: {reason}")
        print("Their network nodes will still appear but won't be clickable into a detail view.")


if __name__ == "__main__":
    main()
