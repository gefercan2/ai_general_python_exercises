#!/usr/bin/env python3
"""
Phase 1: Prepare Structural Data
Reads a single document (.txt/.md/.pdf), preserving paragraph boundaries,
and computes topic frequencies, word occurrence positions, citations, and
a broader word-cloud frequency list. Writes structure.json.

Usage:
    python3 prepare_structure.py <input_file> <output.json> [--top-topics 10] [--word-cloud-size 30] [--min-word-len 4]
"""
import sys
import os
import re
import json
import argparse
from collections import Counter

WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z\-']+")
HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+(.*)$")

_NAME = r"[A-Z][a-zA-Z\.\-]+(?:\s+(?:and|&)\s+[A-Z][a-zA-Z\.\-]+)?(?:\s+et al\.?)?"
_YEAR = r"(?:1[0-9]{3}|20[0-4][0-9])"
CITATION_RE = re.compile(
    r"\(" + _NAME + r",?\s*" + _YEAR + r"\)"
    r"|" + _NAME + r"\s*\(" + _YEAR + r"\)"
)

DEFAULT_STOPWORDS_FILE = os.path.join(os.path.dirname(__file__), "..", "references", "stopwords.txt")


def load_stopwords():
    words = set()
    if os.path.exists(DEFAULT_STOPWORDS_FILE):
        with open(DEFAULT_STOPWORDS_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip().lower()
                if line and not line.startswith("#"):
                    words.add(line)
    return words


def read_raw_text(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(path)
        pages = [(p.extract_text() or "") for p in reader.pages]
        # Heuristic: join pages with a blank line so page breaks don't
        # accidentally merge unrelated paragraphs.
        return "\n\n".join(pages)
    elif ext in (".md", ".markdown", ".txt"):
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    else:
        raise ValueError(f"Unsupported file type: {ext} (use .txt, .md, or .pdf)")


def split_paragraphs(raw_text):
    """Splits on blank lines (2+ newlines). Detects markdown headings.
    Returns list of {index, text, word_count, is_heading}."""
    blocks = re.split(r"\n\s*\n+", raw_text.strip())
    paragraphs = []
    idx = 0
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        heading_match = HEADING_RE.match(block)
        is_heading = bool(heading_match)
        text = heading_match.group(1).strip() if is_heading else re.sub(r"\s+", " ", block)
        word_count = len(text.split())
        if word_count == 0:
            continue
        paragraphs.append({
            "index": idx,
            "text": text,
            "word_count": word_count,
            "is_heading": is_heading,
        })
        idx += 1
    return paragraphs


def tokenize_with_positions(paragraphs, min_word_len, stopwords):
    """Returns list of (word, paragraph_index, token_index_in_paragraph)."""
    tokens = []
    for p in paragraphs:
        words = WORD_RE.findall(p["text"])
        for pos, w in enumerate(words):
            wl = w.lower()
            if len(wl) >= min_word_len and wl not in stopwords:
                tokens.append((wl, p["index"], pos))
    return tokens


def compute_topics(tokens, top_n, window=6):
    """tokens: list of (word, para_idx, pos_in_para). Returns topic list
    with related (co-occurring) words, using a simple sliding window over
    each paragraph's token sequence."""
    counts = Counter(t[0] for t in tokens)
    top_terms = [w for w, _ in counts.most_common(top_n)]
    top_set = set(top_terms)

    # Group tokens by paragraph to compute local co-occurrence
    by_para = {}
    for word, para_idx, pos in tokens:
        by_para.setdefault(para_idx, []).append((pos, word))

    cooccur = {t: Counter() for t in top_terms}
    for para_idx, entries in by_para.items():
        entries.sort()
        words_in_order = [w for _, w in entries]
        for i, w in enumerate(words_in_order):
            if w not in top_set:
                continue
            lo, hi = max(0, i - window), min(len(words_in_order), i + window + 1)
            for j in range(lo, hi):
                if j == i:
                    continue
                neighbor = words_in_order[j]
                if neighbor != w:
                    cooccur[w][neighbor] += 1

    topics = []
    for term in top_terms:
        related = [w for w, _ in cooccur[term].most_common(5)]
        topics.append({"term": term, "count": counts[term], "related": related})
    return topics, top_set


def compute_word_track(tokens, top_set, window=4):
    """For each occurrence of a top-set word, record its paragraph and
    colocate words within a small window (for tooltip display)."""
    by_para = {}
    for word, para_idx, pos in tokens:
        by_para.setdefault(para_idx, []).append((pos, word))

    occurrences = []
    for para_idx, entries in by_para.items():
        entries.sort()
        words_in_order = [w for _, w in entries]
        for i, w in enumerate(words_in_order):
            if w not in top_set:
                continue
            lo, hi = max(0, i - window), min(len(words_in_order), i + window + 1)
            colocates = [words_in_order[j] for j in range(lo, hi) if j != i]
            occurrences.append({
                "word": w,
                "paragraph_index": para_idx,
                "colocates": colocates[:6],
            })
    return occurrences


def compute_word_cloud(tokens, size):
    counts = Counter(t[0] for t in tokens)
    return [{"term": w, "count": c} for w, c in counts.most_common(size)]


def extract_citations_by_paragraph(paragraphs):
    citations = []
    for p in paragraphs:
        for m in CITATION_RE.finditer(p["text"]):
            citations.append({"paragraph_index": p["index"], "text": m.group(0)})
    return citations


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_file")
    parser.add_argument("output_path")
    parser.add_argument("--top-topics", type=int, default=10)
    parser.add_argument("--word-cloud-size", type=int, default=30)
    parser.add_argument("--min-word-len", type=int, default=4)
    parser.add_argument("--include-full-text", action="store_true",
                         help="Embed the full reconstructed document text in the output, for a 'read full document' panel. Off by default to keep structure.json lean.")
    args = parser.parse_args()

    raw_text = read_raw_text(args.input_file)
    paragraphs = split_paragraphs(raw_text)

    if not paragraphs:
        print("ERROR: No paragraphs could be extracted — is the file empty or an image-only PDF?")
        sys.exit(1)

    stopwords = load_stopwords()
    tokens = tokenize_with_positions(paragraphs, args.min_word_len, stopwords)

    topics, top_set = compute_topics(tokens, args.top_topics)
    word_track = compute_word_track(tokens, top_set)
    word_cloud = compute_word_cloud(tokens, args.word_cloud_size)
    citations = extract_citations_by_paragraph(paragraphs)

    total_words = sum(p["word_count"] for p in paragraphs)
    structure = {
        "title": os.path.splitext(os.path.basename(args.input_file))[0],
        "paragraphs": paragraphs,
        "topics": topics,
        "word_track": word_track,
        "word_cloud": word_cloud,
        "citations": citations,
        "stats": {
            "total_words": total_words,
            "total_paragraphs": len(paragraphs),
        },
    }
    if args.include_full_text:
        structure["full_text"] = "\n\n".join(
            (f"# {p['text']}" if p["is_heading"] else p["text"]) for p in paragraphs
        )

    os.makedirs(os.path.dirname(os.path.abspath(args.output_path)) or ".", exist_ok=True)
    with open(args.output_path, "w", encoding="utf-8") as f:
        json.dump(structure, f, indent=2)

    print(f"Prepared structure data -> {args.output_path}")
    print(f"  {len(paragraphs)} paragraphs, {total_words} words, {len(topics)} topics, "
          f"{len(word_track)} word occurrences, {len(citations)} citations")

    if len(paragraphs) < 5 or total_words < 300:
        print("NOTE: this document is quite short — the radial visualization may look sparse. "
              "Consider whether a simpler chart would serve better.")


if __name__ == "__main__":
    main()
