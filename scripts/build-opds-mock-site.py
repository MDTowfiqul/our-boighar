#!/usr/bin/env python3
"""Build a mock Jekyll `site` dataset from the real _books/ front matter,
for rendering the OPDS Liquid templates with LiquidJS (no Ruby here)."""
import glob
import json
import os
import re
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/opds-verify/site.json"


def main():
    books = []
    for path in sorted(glob.glob(os.path.join(ROOT, "_books", "*.md"))):
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        m = re.match(r"---\n(.*?)\n---\n(.*)$", text, re.S)
        fm = yaml.safe_load(m.group(1))
        desc = m.group(2).strip()
        slug = os.path.splitext(os.path.basename(path))[0]
        books.append({
            "book_id": fm.get("book_id", slug),
            "title": fm.get("title", ""),
            "title_en": fm.get("title_en"),
            "author": fm.get("author", ""),
            "creator": fm.get("creator"),
            "category": fm.get("category"),
            "categories": fm.get("categories", []),
            "language": fm.get("language"),
            "language_label": fm.get("language_label"),
            "cover": fm.get("cover"),
            "file": fm.get("file"),
            "format": fm.get("format"),
            "file_size": fm.get("file_size"),
            "year": fm.get("year"),
            "url": f"/books/{slug}/",
            "content": desc,
        })
    with open(os.path.join(ROOT, "_data", "recent.yml"), encoding="utf-8") as fh:
        recent = yaml.safe_load(fh)
    with open(os.path.join(ROOT, "_data", "popular.json"), encoding="utf-8") as fh:
        popular = json.load(fh)
    with open(os.path.join(ROOT, "_data", "author_slugs.yml"), encoding="utf-8") as fh:
        author_slugs = yaml.safe_load(fh)
    with open(os.path.join(ROOT, "_data", "authors.yml"), encoding="utf-8") as fh:
        authors = yaml.safe_load(fh)
    site = {
        "books": books,
        "time": "2026-11-17T12:00:00+06:00",
        "data": {"recent": recent, "popular": popular, "author_slugs": author_slugs, "authors": authors},
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(site, fh, ensure_ascii=False)
    print(f"{len(books)} books, {len(recent)} recent, {len(popular)} popular ranks -> {OUT}")


if __name__ == "__main__":
    main()
