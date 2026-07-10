#!/usr/bin/env python3
"""
Phase 1: Ingest & Extract Text
Walks an input directory for .pdf, .txt, .md files and extracts plain text
from each into a single manifest JSON.

Usage:
    python3 extract_text.py <input_dir> <output_manifest.json>
"""
import sys
import os
import json
import re
import hashlib
import argparse


def slugify_id(path):
    return hashlib.md5(path.encode("utf-8")).hexdigest()[:10]


def fingerprint(path):
    """Cheap change-detection signature: size + mtime. Not a content hash —
    fast even on large corpora, at the cost of being fooled by a file
    rewritten with identical size+mtime (rare in practice)."""
    st = os.stat(path)
    return f"{st.st_size}-{int(st.st_mtime)}"


def extract_pdf_text(path):
    try:
        from pypdf import PdfReader
    except ImportError:
        raise RuntimeError("pypdf is not installed — cannot read PDF files")
    reader = PdfReader(path)
    pages = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:
            pages.append("")
    return "\n".join(pages)


def extract_md_text(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        raw = f.read()
    try:
        import markdown
        from html import unescape
        html = markdown.markdown(raw)
        text = re.sub(r"<[^>]+>", " ", html)
        text = unescape(text)
        return re.sub(r"\s+", " ", text).strip()
    except ImportError:
        # Fall back to stripping common markdown syntax manually
        text = re.sub(r"```.*?```", " ", raw, flags=re.S)
        text = re.sub(r"[#*_`>\-\[\]()]", " ", text)
        return re.sub(r"\s+", " ", text).strip()


def extract_txt_text(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_dir")
    parser.add_argument("output_path")
    parser.add_argument("--incremental", action="store_true",
                         help="If output_path already exists, reuse entries for unchanged files "
                              "(same size+mtime) and only re-extract new or modified files. "
                              "Files no longer present in input_dir are dropped from the manifest.")
    args = parser.parse_args()

    input_dir, output_path = args.input_dir, args.output_path
    if not os.path.isdir(input_dir):
        print(f"Error: {input_dir} is not a directory")
        sys.exit(1)

    prior_by_relpath = {}
    if args.incremental and os.path.exists(output_path):
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                prior = json.load(f)
            for doc in prior.get("documents", []):
                prior_by_relpath[doc["relative_path"]] = doc
        except (json.JSONDecodeError, KeyError):
            print(f"WARNING: could not read existing {output_path} for incremental reuse — doing a full extraction.")

    manifest = []
    failures = []
    extensions = {".pdf": extract_pdf_text, ".md": extract_md_text,
                  ".txt": extract_txt_text, ".markdown": extract_md_text}

    seen_relpaths = set()
    new_count = changed_count = reused_count = 0

    for root, _, files in os.walk(input_dir):
        for fname in sorted(files):
            ext = os.path.splitext(fname)[1].lower()
            if ext not in extensions:
                continue
            full_path = os.path.join(root, fname)
            rel_path = os.path.relpath(full_path, input_dir)
            seen_relpaths.add(rel_path)

            current_fp = fingerprint(full_path)
            prior_doc = prior_by_relpath.get(rel_path)

            if args.incremental and prior_doc and prior_doc.get("fingerprint") == current_fp:
                manifest.append(prior_doc)
                reused_count += 1
                continue

            try:
                text = extensions[ext](full_path)
                text = text.strip()
                word_count = len(text.split())
                manifest.append({
                    "id": slugify_id(full_path),
                    "filename": fname,
                    "relative_path": rel_path,
                    "filetype": ext.lstrip("."),
                    "text": text,
                    "word_count": word_count,
                    "fingerprint": current_fp,
                })
                if prior_doc:
                    changed_count += 1
                else:
                    new_count += 1
                if word_count == 0:
                    failures.append({"file": fname, "reason": "no extractable text (possibly scanned/image-only)"})
            except Exception as e:
                failures.append({"file": fname, "reason": str(e)})

    removed = [rp for rp in prior_by_relpath if rp not in seen_relpaths]

    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({"documents": manifest, "failures": failures}, f, indent=2)

    if args.incremental and prior_by_relpath:
        print(f"Incremental extraction -> {output_path}")
        print(f"  {new_count} new, {changed_count} changed, {reused_count} unchanged (reused), {len(removed)} removed")
        if removed:
            print(f"  Removed: {removed}")
    else:
        print(f"Extracted {len(manifest)} documents -> {output_path}")
    if failures:
        print(f"WARNING: {len(failures)} file(s) had issues:")
        for fail in failures:
            print(f"  - {fail['file']}: {fail['reason']}")


if __name__ == "__main__":
    main()
