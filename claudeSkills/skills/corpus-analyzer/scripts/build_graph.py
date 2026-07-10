#!/usr/bin/env python3
"""
Phase 3: Build Relationship Graph
Reads corpus_analysis.json and produces graph_data.json:
  { nodes: [...], links: [...], timeline: [...] }
Nodes = one per document. Links = documents sharing >= --min-shared-keywords
top keywords, weighted by overlap. Timeline = flattened date entries per doc.

Usage:
    python3 build_graph.py <corpus_analysis.json> <output_graph.json> [--min-shared-keywords 2]
"""
import sys
import os
import json
import argparse
from itertools import combinations


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("analysis_path")
    parser.add_argument("output_path")
    parser.add_argument("--min-shared-keywords", type=int, default=2)
    args = parser.parse_args()

    with open(args.analysis_path, "r", encoding="utf-8") as f:
        analysis = json.load(f)

    docs = analysis["documents"]

    nodes = []
    keyword_sets = {}
    for doc in docs:
        terms = set(k["term"] for k in doc["keywords"])
        keyword_sets[doc["id"]] = terms
        nodes.append({
            "id": doc["id"],
            "label": doc["filename"],
            "type": doc["filetype"],
            "top_keywords": [k["term"] for k in doc["keywords"][:5]],
            "word_count": doc["word_count"],
            "excerpt": doc["excerpt"],
            "citation_count": len(doc["citations"]),
        })

    links = []
    for doc_a, doc_b in combinations(docs, 2):
        shared = keyword_sets[doc_a["id"]] & keyword_sets[doc_b["id"]]
        if len(shared) >= args.min_shared_keywords:
            union = keyword_sets[doc_a["id"]] | keyword_sets[doc_b["id"]]
            jaccard = len(shared) / len(union) if union else 0
            links.append({
                "source": doc_a["id"],
                "target": doc_b["id"],
                "shared_keywords": sorted(shared),
                "weight": round(jaccard, 4),
            })

    # Timeline: flatten dates per doc into {id, label, start, end}
    timeline = []
    for doc in docs:
        for i, d in enumerate(doc["dates"]):
            timeline.append({
                "id": f"{doc['id']}-date{i}",
                "doc_id": doc["id"],
                "label": doc["filename"],
                "start": d["start"],
                "end": d.get("end"),
                "type": d["type"],
            })
    timeline.sort(key=lambda t: t["start"])

    graph = {"nodes": nodes, "links": links, "timeline": timeline}

    os.makedirs(os.path.dirname(os.path.abspath(args.output_path)) or ".", exist_ok=True)
    with open(args.output_path, "w", encoding="utf-8") as f:
        json.dump(graph, f, indent=2)

    print(f"Built graph: {len(nodes)} nodes, {len(links)} links, {len(timeline)} timeline entries -> {args.output_path}")
    isolated = [n["label"] for n in nodes if not any(l["source"] == n["id"] or l["target"] == n["id"] for l in links)]
    if isolated:
        print(f"NOTE: {len(isolated)} document(s) have no links at current threshold: {isolated}")
        print("      Lower --min-shared-keywords if you expected more connections.")


if __name__ == "__main__":
    main()
