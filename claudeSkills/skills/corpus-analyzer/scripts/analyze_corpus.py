#!/usr/bin/env python3
"""
Phase 2: Analyze Content
Reads manifest.json (from extract_text.py) and produces corpus_analysis.json
containing per-document top keywords (TF-IDF, stdlib only), extracted dates,
extracted citations, and a short excerpt.

Usage:
    python3 analyze_corpus.py <manifest.json> <output_analysis.json> [--top-n 12] [--min-word-len 4]
"""
import sys
import os
import json
import re
import math
import argparse
from collections import Counter

DEFAULT_STOPWORDS_FILE = os.path.join(os.path.dirname(__file__), "..", "references", "stopwords.txt")

WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z\-']+")

# Matches: 1518-1594 | 1518–1594 | (1518-1594) | born 1518 died 1594
DATE_RANGE_RE = re.compile(r"\b(1[0-9]{3}|20[0-4][0-9])\s*[-–—]\s*(1[0-9]{3}|20[0-4][0-9])\b")
SINGLE_YEAR_RE = re.compile(r"\b(1[0-9]{3}|20[0-4][0-9])\b")

# Matches: (Smith, 2020) | Smith (2020) | (Smith and Jones, 2019)
_NAME = r"[A-Z][a-zA-Z\.\-]+(?:\s+(?:and|&)\s+[A-Z][a-zA-Z\.\-]+)?(?:\s+et al\.?)?"
_YEAR = r"(?:1[0-9]{3}|20[0-4][0-9])"
CITATION_RE = re.compile(
    r"\(" + _NAME + r",?\s*" + _YEAR + r"\)"
    r"|" + _NAME + r"\s*\(" + _YEAR + r"\)"
)


def load_stopwords():
    words = set()
    if os.path.exists(DEFAULT_STOPWORDS_FILE):
        with open(DEFAULT_STOPWORDS_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip().lower()
                if line and not line.startswith("#"):
                    words.add(line)
    return words


def tokenize(text, min_word_len, stopwords):
    tokens = [w.lower() for w in WORD_RE.findall(text)]
    return [t for t in tokens if len(t) >= min_word_len and t not in stopwords]


def compute_tfidf(doc_tokens_list, top_n):
    """doc_tokens_list: list of token-lists, one per document. Returns list of
    top-N (word, score) lists, one per document."""
    n_docs = len(doc_tokens_list)
    df = Counter()
    for tokens in doc_tokens_list:
        for word in set(tokens):
            df[word] += 1

    results = []
    for tokens in doc_tokens_list:
        tf = Counter(tokens)
        total = sum(tf.values()) or 1
        scores = {}
        for word, count in tf.items():
            tf_score = count / total
            idf_score = math.log((n_docs + 1) / (df[word] + 1)) + 1
            scores[word] = tf_score * idf_score
        top = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:top_n]
        results.append([{"term": w, "score": round(s, 5)} for w, s in top])
    return results


def extract_dates(text, citation_spans=None):
    """citation_spans: list of (start_char, end_char) for citation matches in
    text — years inside these spans are excluded, since a citation year
    (e.g. "(Ridolfi, 1648)") is not a biographical/event date."""
    citation_spans = citation_spans or []

    def in_citation(pos):
        return any(s <= pos < e for s, e in citation_spans)

    ranges = []
    seen_spans = set()
    for m in DATE_RANGE_RE.finditer(text):
        if in_citation(m.start()):
            continue
        start, end = int(m.group(1)), int(m.group(2))
        if start <= end:
            span = (start, end)
            if span not in seen_spans:
                seen_spans.add(span)
                ranges.append({"start": start, "end": end, "type": "range"})

    # Single years not already part of a captured range, and not inside a citation
    covered = set()
    for r in ranges:
        covered.update([r["start"], r["end"]])
    singles = sorted(set(
        int(m.group(0)) for m in SINGLE_YEAR_RE.finditer(text) if not in_citation(m.start())
    ) - covered)
    for y in singles:
        ranges.append({"start": y, "end": None, "type": "single"})

    return ranges


def find_citation_matches(text):
    """Returns (list_of_citation_strings, list_of_(start,end)_spans)."""
    found, spans = [], []
    for m in CITATION_RE.finditer(text):
        spans.append((m.start(), m.end()))
        raw = m.group(0)
        if raw not in found:
            found.append(raw)
    return found, spans


def make_excerpt(text, n_words=40):
    words = text.split()
    excerpt = " ".join(words[:n_words])
    return excerpt + ("..." if len(words) > n_words else "")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest_path")
    parser.add_argument("output_path")
    parser.add_argument("--top-n", type=int, default=12)
    parser.add_argument("--min-word-len", type=int, default=4)
    args = parser.parse_args()

    with open(args.manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    docs = manifest["documents"]
    stopwords = load_stopwords()

    doc_tokens = [tokenize(d["text"], args.min_word_len, stopwords) for d in docs]
    tfidf_results = compute_tfidf(doc_tokens, args.top_n)

    analysis = []
    for doc, keywords in zip(docs, tfidf_results):
        citations, citation_spans = find_citation_matches(doc["text"])
        analysis.append({
            "id": doc["id"],
            "filename": doc["filename"],
            "filetype": doc["filetype"],
            "word_count": doc["word_count"],
            "keywords": keywords,
            "dates": extract_dates(doc["text"], citation_spans),
            "citations": citations[:25],
            "excerpt": make_excerpt(doc["text"]),
        })

    os.makedirs(os.path.dirname(os.path.abspath(args.output_path)) or ".", exist_ok=True)
    with open(args.output_path, "w", encoding="utf-8") as f:
        json.dump({"documents": analysis}, f, indent=2)

    print(f"Analyzed {len(analysis)} documents -> {args.output_path}")
    no_keywords = [d["filename"] for d in analysis if not d["keywords"]]
    if no_keywords:
        print(f"NOTE: {len(no_keywords)} document(s) produced no keywords (likely empty/short text): {no_keywords}")


if __name__ == "__main__":
    main()
