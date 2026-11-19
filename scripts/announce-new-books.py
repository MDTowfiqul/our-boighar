#!/usr/bin/env python3
"""Announce newly added Our Boighar books on Telegram.

Usage: python3 scripts/announce-new-books.py added.txt
  added.txt: one `_books/<slug>.md` path per line (from git diff).

Reads each book's front matter (title, author), waits until its live page
returns 200 (GitHub Pages deploys ~1-2 min after the merge), then posts one
Bengali message to the Telegram channel via the Bot API.

Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (group id, e.g. -100...),
TELEGRAM_TOPIC_ID (optional: the Our Boighar topic's message_thread_id,
so the post lands in that topic instead of the group's General).
Stdlib only.
"""

import json
import os
import re
import sys
import time
import urllib.request

SITE = "https://mdtowfiqul.github.io/our-boighar"
BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")


def bn(n):
    return str(n).translate(BN_DIGITS)


def parse_front_matter(path):
    """Minimal front-matter parser: `key: "value"` lines only."""
    fields = {}
    with open(path, encoding="utf-8") as f:
        text = f.read()
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        return fields
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        value = value.strip().strip('"').strip("'")
        fields[key.strip()] = value
    return fields


def wait_live(url, tries=10, delay=30):
    """Poll until the book page returns 200 (max ~5 min)."""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(req, timeout=20) as r:
                if r.status == 200:
                    return True
        except Exception as e:
            print(f"  {url}: not live yet ({e})")
        if i < tries - 1:
            time.sleep(delay)
    return False


def main():
    added_file = sys.argv[1]
    with open(added_file, encoding="utf-8") as f:
        paths = [p.strip() for p in f if p.strip()]

    books = []
    for p in paths:
        fm = parse_front_matter(p)
        slug = fm.get("book_id") or os.path.splitext(os.path.basename(p))[0]
        title = fm.get("title", slug)
        author = fm.get("author", "")
        url = f"{SITE}/books/{slug}/"
        live = wait_live(url)
        print(f"{'live' if live else 'STILL NOT LIVE, posting anyway'}: {title} -> {url}")
        books.append((title, author, url))

    total = len([f for f in os.listdir("_books") if f.endswith(".md")])

    lines = ["Our Boighar-এ নতুন বই", ""]
    for i, (title, author, url) in enumerate(books, 1):
        lines.append(f"{bn(i)}। {title} — {author}")
        lines.append(f"পড়ুন: {url}")
        lines.append("")
    lines.append(f"মোট বই: {bn(total)}টি")
    text = "\n".join(lines)

    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat_id = os.environ["TELEGRAM_CHAT_ID"]
    topic_id = os.environ.get("TELEGRAM_TOPIC_ID")
    payload = {"chat_id": chat_id, "text": text}
    if topic_id:
        payload["message_thread_id"] = int(topic_id)
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        result = json.load(r)
    print(json.dumps(result, ensure_ascii=False))
    if not result.get("ok"):
        sys.exit(f"Telegram send failed: {result}")


if __name__ == "__main__":
    main()
