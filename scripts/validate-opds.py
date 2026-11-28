#!/usr/bin/env python3
"""Validate the LiquidJS-rendered OPDS feeds: strict XML well-formedness,
OPDS 1.2 structure, entry counts, pagination, link integrity."""
import glob
import json
import os
import sys
import xml.etree.ElementTree as ET

OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/opds-verify/out"
SITE = json.load(open(sys.argv[2] if len(sys.argv) > 2 else "/tmp/opds-verify/site.json"))
BOOKS = {b["book_id"]: b for b in SITE["books"]}
BASE = "https://mdtowfiqul.github.io/our-boighar"

ATOM = "{http://www.w3.org/2005/Atom}"
DC = "{http://purl.org/dc/terms/}"

errors = []
notes = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


def parse(fname):
    path = os.path.join(OUT, fname)
    data = open(path, encoding="utf-8").read()
    if data.startswith("\ufeff"):
        errors.append(f"{fname}: starts with BOM")
    if not data.startswith("<?xml"):
        errors.append(f"{fname}: does not start with XML declaration: {data[:60]!r}")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        errors.append(f"{fname}: XML PARSE ERROR: {e}")
        return None, data
    check(root.tag == ATOM + "feed", f"{fname}: root is {root.tag}, not atom:feed")
    check(root.get("xmlns:dc") is None or True, "")  # namespaces are attributes in raw text
    return root, data


def entries(root):
    return root.findall(ATOM + "entry") if root is not None else []


def links(entry, rel=None):
    out = []
    for l in entry.findall(ATOM + "link"):
        if rel is None or l.get("rel") == rel:
            out.append(l)
    return out


def entry_ids(root):
    return [e.findtext(ATOM + "id") for e in entries(root)]


# --- 1. every rendered feed parses ---------------------------------------
feeds = {}
for path in sorted(glob.glob(os.path.join(OUT, "*.xml"))):
    fname = os.path.basename(path)
    root, _ = parse(fname)
    feeds[fname] = root

# --- 2. all-books pagination: 479 unique, 50/50/.../29, sorted ----------
all_ids = []
for n in range(1, 11):
    root = feeds.get(f"all-{n}.xml")
    check(root is not None, f"all-{n}.xml missing")
    if root is None:
        continue
    es = entries(root)
    expect = 50 if n < 10 else 29
    check(len(es) == expect, f"all-{n}.xml has {len(es)} entries, expected {expect}")
    all_ids.extend(entry_ids(root))
    # pagination links
    rels = {l.get("rel"): l.get("href") for l in root.findall(ATOM + "link")}
    check(rels.get("first") == f"{BASE}/opds/all-1.xml", f"all-{n}.xml first link wrong: {rels.get('first')}")
    check(rels.get("last") == f"{BASE}/opds/all-10.xml", f"all-{n}.xml last link wrong")
    if n > 1:
        check(rels.get("previous") == f"{BASE}/opds/all-{n-1}.xml", f"all-{n}.xml prev wrong")
    if n < 10:
        check(rels.get("next") == f"{BASE}/opds/all-{n+1}.xml", f"all-{n}.xml next wrong")
    check(root.findtext(ATOM + "title") == f"Our Boighar — All Books (page {n} of 10)",
          f"all-{n}.xml title wrong")
check(len(all_ids) == 479, f"all-books total entries {len(all_ids)}, expected 479")
check(len(set(all_ids)) == 479, "all-books has duplicate entry ids")
expected_urls = {f"{BASE}/books/{b}/" for b in BOOKS}
check(set(all_ids) == expected_urls, "all-books entry ids != book page URLs")
titles = []
for n in range(1, 11):
    root = feeds[f"all-{n}.xml"]
    titles.extend([e.findtext(ATOM + "title") for e in entries(root)])
check(titles == sorted(titles), "all-books entries are not in A-Z title order")

# --- 3. entry field completeness (spot-check every all-books entry) -------
n_acq = n_img = n_lang = n_creator = n_contrib = n_summary = 0
for n in range(1, 11):
    for e in entries(feeds[f"all-{n}.xml"]):
        acq = links(e, "http://opds-spec.org/acquisition")
        check(len(acq) == 1, f"entry {e.findtext(ATOM+'id')}: {len(acq)} acquisition links")
        if acq:
            n_acq += 1
            check(acq[0].get("type") == "application/epub+zip", "acquisition type wrong")
            check(acq[0].get("href", "").startswith(BASE + "/books/") and acq[0].get("href", "").endswith(".epub"),
                  f"acquisition href wrong: {acq[0].get('href')}")
        img = links(e, "http://opds-spec.org/image")
        check(len(img) == 1, "entry missing image link")
        if img:
            n_img += 1
            check(img[0].get("type") == "image/jpeg", "image type wrong")
            check(img[0].get("href", "").startswith(BASE + "/img/"), "image href wrong")
        if e.find(DC + "language") is not None:
            n_lang += 1
            check(e.findtext(DC + "language") in ("bn", "en"), "language value wrong")
        if e.find(DC + "creator") is not None:
            n_creator += 1
        if e.find(DC + "contributor") is not None:
            n_contrib += 1
        s = e.find(ATOM + "summary")
        if s is not None and (s.text or "").strip():
            n_summary += 1
        # author element present and non-empty
        a = e.find(ATOM + "author/" + ATOM + "name")
        check(a is not None and (a.text or "").strip(), "entry missing author name")
        # no raw '<' inside summary text (would have broken parsing anyway)
check(n_acq == 479, f"acquisition links: {n_acq}/479")
check(n_img == 479, f"image links: {n_img}/479")
check(n_lang == 479, f"language elements: {n_lang}/479")
notes.append(f"dc:creator present on {n_creator}/479, dc:contributor on {n_contrib}/479, "
             f"non-empty summary on {n_summary}/479")

# --- 4. catalog / categories / authors navigation feeds --------------------
root = feeds["catalog.xml"]
check(len(entries(root)) == 5, f"catalog has {len(entries(root))} entries, expected 5")
for e in entries(root):
    sub = links(e, "subsection")
    check(len(sub) == 1, "catalog entry without subsection link")
    check(sub[0].get("type", "").startswith("application/atom+xml;profile=opds-catalog"),
          "catalog subsection type wrong")

root = feeds["categories.xml"]
check(len(entries(root)) == 18, f"categories.xml has {len(entries(root))} entries, expected 18")
for e in entries(root):
    check(e.findtext(ATOM + "title", "").endswith(")"), "category entry title lacks count")

root = feeds["authors.xml"]
check(len(entries(root)) == 20, f"authors.xml has {len(entries(root))} entries, expected 20")

# --- 5. category feeds: counts incl. multi-category + Health ---------------
import collections
cat_expected = collections.Counter()
for b in SITE["books"]:
    for c in b["categories"]:
        cat_expected[c] += 1
slug = lambda c: __import__("re").sub(r"[^a-z0-9]+", "-", c.lower()).strip("-")
total_cat_entries = 0
for c, n in sorted(cat_expected.items()):
    fname = f"category-{slug(c)}.xml"
    root = feeds.get(fname)
    check(root is not None, f"{fname} missing for category {c!r}")
    if root is None:
        continue
    got = len(entries(root))
    check(got == n, f"{fname}: {got} entries, expected {n} for {c!r}")
    total_cat_entries += got
notes.append(f"category feeds total {total_cat_entries} entries (479 books, "
             f"{total_cat_entries - 479} in a 2nd category)")

# --- 6. author feeds ---------------------------------------------------------
auth_expected = collections.Counter(b["author"] for b in SITE["books"])
top20 = sorted(auth_expected.items(), key=lambda kv: (-kv[1], kv[0]))[:20]
slugs = SITE["data"]["author_slugs"]
for author, n in top20:
    fname = f"author-{slugs[author]}.xml"
    root = feeds.get(fname)
    check(root is not None, f"{fname} missing for author {author!r}")
    if root is None:
        continue
    got = len(entries(root))
    check(got == n, f"{fname}: {got} entries, expected {n} for {author!r}")
    for e in entries(root):
        nm = e.find(ATOM + "author/" + ATOM + "name")
        check(nm is not None and nm.text == author, f"{fname}: entry author mismatch")

# --- 7. new + popular ---------------------------------------------------------
root = feeds["new.xml"]
recent = SITE["data"]["recent"]
got = len(entries(root))
check(got == len(recent), f"new.xml has {got} entries, recent.yml has {len(recent)}")
check(entry_ids(root) == [f"{BASE}/books/{i}/" for i in recent],
      "new.xml entry order != recent.yml order")

root = feeds["popular.xml"]
pop = SITE["data"]["popular"]
top100 = [k for k, _ in sorted(pop.items(), key=lambda kv: kv[1])[:100]]
got = len(entries(root))
check(got == 100, f"popular.xml has {got} entries, expected 100")
check(entry_ids(root) == [f"{BASE}/books/{i}/" for i in top100],
      "popular.xml entry order != rank order")

# --- 8. feed-level: self/start links absolute, namespaces present ------------
for fname, root in feeds.items():
    if root is None:
        continue
    selfs = links(root, "self")
    check(len(selfs) == 1 and selfs[0].get("href") == f"{BASE}/opds/{fname}",
          f"{fname}: self link wrong: {[s.get('href') for s in selfs]}")
    starts = links(root, "start")
    check(len(starts) == 1 and starts[0].get("href") == f"{BASE}/opds/catalog.xml",
          f"{fname}: start link wrong")
    raw = open(os.path.join(OUT, fname), encoding="utf-8").read()
    check('xmlns="http://www.w3.org/2005/Atom"' in raw, f"{fname}: missing Atom ns")
    check('xmlns:dc="http://purl.org/dc/terms/"' in raw, f"{fname}: missing dc ns")
    check('xmlns:opds="http://opds-spec.org/2010/catalog"' in raw, f"{fname}: missing opds ns")

print(f"feeds checked: {len(feeds)}")
for n in notes:
    print("NOTE:", n)
if errors:
    print(f"\n{len(errors)} ERROR(S):")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("\nALL OPDS CHECKS PASSED")
