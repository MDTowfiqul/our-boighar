# Managing books on Our Boighar — full guide

The site is a Jekyll site. **Every book is one small Markdown file** in the
`_books/` folder — Jekyll builds its page automatically at
`/books/<filename>/`. If that file exists, the book is on the site. If it is
deleted, the book is gone. You never edit HTML or JSON.

Everything below can be done from your phone with the GitHub app or
github.com in the browser, in the repo **MDTowfiqul/our-boighar**.

---

## 1. Add a book

1. **Upload the ebook file** (free books only): open the `books/` folder →
   **Add file → Upload files** → choose the EPUB → **Commit**.
   Max 100 MB per file. Use a simple filename: lowercase, dashes, no spaces
   (e.g. `my-book.epub`).
   *Paid books: skip this step — the file stays on Gumroad only.*
2. **Upload the cover**: open the `img/` folder → **Add file → Upload files**
   → choose the cover image → **Commit**.
3. **Create the book entry**: open the `_books/` folder → **Add file →
   Create new file** → name it `my-book.md` (same name as the EPUB) → paste
   the template below, fill it in → **Commit**.

```markdown
---
book_id: "my-book"
title: "বইয়ের নাম"
title_en: "English title"
author: "Writer name"
creator: "Who made this ebook edition"
category: "Hadith"
categories: ["Hadith", "Spirituality"]
language: "bn"
language_label: "Bengali"
alphabet: "ব"
cover: "/img/cover-my-book.jpg"
file: "/books/my-book.epub"
format: "EPUB"
file_size: "1.2 MB"
year: "2023"
---

Two or three sentences describing the book go here — this becomes the
"About this book" text on its page.
```

**Description language rule:** the description text (below the second
`---`) must be written in the book's own language — a Bengali book gets a
Bengali description, an English book an English one. It is shown on the
book page exactly as written, in both site languages.

4. Wait 1–2 minutes, then check the live page:
   `https://mdtowfiqul.github.io/our-boighar/books/my-book/`

**Field notes**

| Field | Notes |
|---|---|
| `book_id` | unique slug, same as the filename; also used for bookmarks & comments |
| `title` / `title_en` | Bengali title / English title (shown when visitors switch to EN) |
| `author` | the writer |
| `creator` | who made this ebook edition (translator, publisher, scanner…) |
| `category` | the main category (used for "related books") |
| `categories` | all tags, e.g. `["Hadith", "Spirituality"]` |
| `language` / `language_label` | `bn`/`Bengali` or `en`/`English` |
| `alphabet` | first letter of the title — Bengali letter for Bengali titles (ই, ত, র…), capital letter for English ones (A, H…) |
| `cover` | path to the cover in `img/` |
| `file` | path to the EPUB in `books/` — omit for paid books; then set `gumroad:` + `price:` instead |
| `file_size`, `year` | optional — shown on the book page when present |
| `series` / `series_en` / `series_order` | optional — for books that belong to a series (a multi-part work): the series name in the book's language / in English, and this book's part number (1, 2, 3…). Every book of the same series must use the exact same `series` name. Series with 2+ books on the site automatically get a "📚 এই সিরিজের বই" section on each book's page and a series row on the homepage |
| `toc` | optional list of contents entries; renders a সূচিপত্র (table of contents) section |

**Category names:** categories are stored in English in the book file.
Their Bengali display names live in one map near the top of
`_layouts/default.html` (`window.__obCatBn`) — the site shows the Bengali
name in বাংলা mode and the English name in English mode. If you use a
brand-new category, it will appear in English everywhere until its Bengali
name is added to that map — ask Muse to add it.

---

## 2. Change a book's details

Title, author, category, description, year — all of it lives in the book's
`_books/<slug>.md` file.

1. Open `_books/` → tap the book's `.md` file → tap the **pencil (Edit)**
   icon.
2. Change the field you want (the lines between the two `---` lines), or the
   description text below them.
3. **Commit changes**. The site updates in about a minute.

**Change the cover**: upload the new image into `img/` with the **exact same
filename** (it overwrites), or upload a new name and update `cover:` in the
`.md` file.

---

## 3. Replace a book's file (new edition / fixed EPUB)

1. Open the `books/` folder → **Add file → Upload files** → upload the new
   EPUB with the **exact same filename** → it overwrites the old one.
2. If the size changed, also update `file_size:` in the book's `_books/*.md`
   (see section 2).

For a book stored in an overflow repo (its `file:` is a full URL), do the
same thing inside that repo's `books/` folder.

---

## 4. Remove a book

1. **Delete its entry**: open `_books/<slug>.md` → **⋯ menu (or trash icon)
   → Delete file** → **Commit**. The book's page, listings and search entry
   disappear on the next build (~1 minute).
2. **Free the space** (optional but recommended): delete the EPUB from
   `books/` and the cover from `img/` the same way. If you skip this, the
   files just sit unused — the book is still gone from the site.
3. Note: the book's comments stay stored in GitHub Discussions (invisible,
   harmless). If you ever re-add a book with the same slug, its old comments
   come back.

---

## 5. If something looks wrong

- **Book not showing**: the `.md` filename must end in `.md`; the two `---`
  lines must be intact; no missing quotes.
- **Download / reader says 404**: the `file:` path must match the uploaded
  EPUB's name *exactly* (capital letters matter), and the file must be in
  the same repo the path points to.
- **Book under the wrong letter**: fix the `alphabet:` field.
- **Change didn't appear**: wait 1–2 minutes and refresh — GitHub Pages
  rebuilds are not instant.

## 6. What to leave for Muse

Design/layout changes, editing *inside* an EPUB (fixing chapters or text),
bulk changes across many books, and creating new storage repos — send those
to Muse instead of doing them by hand.

## 7. Author pages (new author names)

Every author has a page at `/authors/<slug>/`, generated by
`scripts/generate-authors.py` (the list lives in
`_data/author_slugs.yml`). A book by an **existing** author appears on
that author's page automatically. If you add a book by a **new** author
name, ask Muse to re-run the script (or run `python3
scripts/generate-authors.py` and commit the new files) so the new author
gets a page and the book's author link points to it. Until then the
author link falls back to a search for that name.

## 8. Tools page (`/tools/`)

`tools.html` is a single self-contained page (one inline script, no
Liquid): 10 browser-only tools — EPUB Reader, EPUB Metadata Viewer,
EPUB to TXT, PDF Merge, PDF Page Extractor, Image to PDF, Cover
Resizer, Reading Planner, Word Counter, Font Lab. Everything runs on
the reader's device; no file is uploaded anywhere. CDN libraries:
JSZip + epub.js (same versions as `reader.html`) and pdf-lib 1.17.1
for the PDF tools — a tool that needs a library shows a message when
offline instead of failing silently. Pins are stored in localStorage
`ob-tools-pinned`; the reading plan in `ob-reading-plan`. To add a
tool, copy one `<article class="tool-card" …>` block (with its
`work-<id>` workspace) and wire it in the same script.

---

## 9. OPDS catalog (`/opds/` — xKAF Phase 2)

The site publishes a standard OPDS 1.2 catalog so any OPDS reader
(KOReader, Our Reader, Thorium) can browse the library and download
books directly. No login, no account — the catalog is public and free.

**Catalog address (give this to readers / apps):**

```
https://mdtowfiqul.github.io/our-boighar/opds/catalog.xml
```

**How it is built.** The feeds are Jekyll/Liquid templates, so they
stay current as books are added — no manual step per book:

- `opds/catalog.xml` — root navigation feed (All Books, Newly Added,
  Popular, Categories, Authors).
- `opds/all-1.xml` … `opds/all-10.xml` — all books A–Z, 50 per page.
- `opds/new.xml` — newly added, from `_data/recent.yml`.
- `opds/popular.xml` — top 100, from `_data/popular.json`
  (see below — it must be refreshed when `popular.json` is re-ranked).
- `opds/categories.xml` — navigation feed for the 18 categories;
  `opds/category-<slug>.xml` — one acquisition feed per category.
- `opds/authors.xml` — navigation feed for the top 20 authors;
  `opds/author-<slug>.xml` — one acquisition feed per top author.
- `opds/index.html` — the human guide page at `/opds/`, with
  Our Reader and KOReader instructions.
- `_includes/opds-feed.xml` + `_includes/opds-entry.xml` — the shared
  feed/entry rendering. Each book entry carries title (in the book's
  own language), writer (`author` + `dc:creator`), ebook creator
  (`dc:contributor`), language, summary, cover image link, book-page
  link, and the EPUB acquisition link (`application/epub+zip`).

**"Open in Our Reader" button** (on every book page): links to
`https://our-reader.vercel.app/opds?url=<category-feed-URL>` — Our
Reader's OPDS browser opens that category feed, and the reader taps
the book → Download to import it into their Our Reader library
(verified in the Our Reader repo: `/opds?url=` opens any catalog
ad-hoc, and the acquisition link is downloaded + imported with the
catalog's title/author/cover winning over the file's own metadata).
One honest limit: the button opens the book's *category* feed, not
the book itself — Our Reader has no per-book deep link — so the
reader still taps the book once inside Our Reader. The button says
so in one line under it. Also note: Our Reader has a `Book.creator`
field for the ebook-creator credit but nothing writes it yet — the
feed already carries the creator as `dc:contributor`, so that credit
will flow once Our Reader wires it up; no change is needed on this
side.

**Regenerating feeds.** The *set* of feed files (not their contents)
is generated — re-run this after adding a book in a brand-new
category, or when the top-20 authors change:

```
python3 scripts/generate-opds.py
```

It rewrites `opds/all-*.xml`, `opds/category-*.xml`,
`opds/author-*.xml` and `opds/authors.xml` (marked in their front
matter; stale ones are deleted). It does NOT touch the hand-written
`catalog.xml`, `categories.xml`, `new.xml`, `popular.xml`. If a new
category is added, also add its name to the `_cats` list in
`opds/categories.xml`. If the book count passes 500, re-run the
script — it will create an 11th `all-*.xml` page automatically.

**Popular feed data.** `_data/popular.json` is a copy of the root
`popular.json` (Jekyll only reads data from `_data/`). Whenever the
weekly popularity re-rank updates `popular.json`, copy it over:

```
cp popular.json _data/popular.json
```

Otherwise the Popular feed keeps showing the old top 100.

**Verifying the feeds locally (no Ruby/Jekyll here).** The feeds can be
rendered with LiquidJS against a mock dataset built from the real
`_books/` files, then strict-parsed as XML:

```
python3 scripts/build-opds-mock-site.py /tmp/opds-verify/site.json
NODE_PATH=/tmp/opds-verify/node_modules node scripts/render-opds.js   # needs: npm install liquidjs (once, in /tmp/opds-verify)
python3 scripts/validate-opds.py /tmp/opds-verify/out /tmp/opds-verify/site.json
```

The validator checks well-formedness, OPDS 1.2 structure, all-books
pagination (475 unique, 50/page), category/author/new/popular counts
and ordering, and that every entry has an EPUB acquisition link, cover
image, language and summary. A real Jekyll build on GitHub Pages
remains the final authority — the first deploy after merging is the
first real build, so check `/opds/catalog.xml` live after merging.

**Offline reading.** `sw.js` (registered from the default layout)
caches the site shell and the EPUBs a reader opens (max 5 EPUBs),
so a book opened once keeps working offline; pages are
network-first, so new books never go stale. Bump `OB_CACHE` in
`sw.js` (`our-boighar-v1` → `v2` …) whenever the cached shell
changes. `/offline/` explains the offline state to the reader.

**Reader notes & highlights.** `reader.html` saves per-book notes
(localStorage `ob-reader-notes`) and text highlights
(`ob-reader-highlights`, painted with epub.js annotations) — both
listed in the reader's Notes tab and on `/shelf/` ("My Notes &
Highlights"), with jump-back-to-the-spot links (`?cfi=`). Both keys
are included in the shelf backup/restore. Nothing leaves the device.

---

## 10. Accounts & dashboard (xKAF Phase 4 — Cloudflare Worker + D1)

Accounts are optional: reading and downloading stay free without one.
An account syncs shelves, reading progress, history, points and rank
across devices. The backend is a Cloudflare Worker (`our-boighar-api`)
with a D1 database (`our-boighar-db`); code, schema and the deploy
guide live in `~/workspace/our-boighar-phase4/` (`worker.js`,
`schema.sql`, `seed-books.sql`, `API.md`, `DEPLOY.md`).

**Site side.** `_config.yml` holds `boighar_api_base` (the Worker URL)
and `boighar_turnstile_site_key` (empty until Turnstile is set up).
`dashboard.html` is the account area at `/dashboard/` (sign-in with
Google or email, Overview, Shelves, History, Ranking, Fix Info,
Support, Guide, Settings). `assets/js/boighar-api.js` is the shared
API client; book pages get a "Save to shelf" control and `reader.html`
syncs progress to the account while reading (debounced, EPUBs only).

**After adding a book.** The Worker validates every `book_id` against
its own `books` table, so a new book is invisible to accounts until it
is seeded there. Re-run the seed after adding books:

```bash
# regenerate seed-books.sql from a BUILT search.json (the repo's search.json
# is a Liquid template — use the Jekyll build output or the live site's copy),
# then paste it into the D1 console (or wrangler d1 execute --file=seed-books.sql)
python3 ~/workspace/our-boighar-phase4/seed-books-from-search.py /tmp/boighar-site/search.json > ~/workspace/our-boighar-phase4/seed-books.sql
```

If the generator is not handy: add one line to `seed-books.sql` —
`INSERT OR REPLACE INTO books (id, title, writer, category, language) VALUES ('<slug>', '<title>', '<writer>', '<category>', '<language>');` —
and paste it into the D1 console (dashboard → D1 → our-boighar-db →
Console → Execute). `INSERT OR REPLACE` makes re-running the whole
seed safe — existing rows are updated, not duplicated.

**No password-reset email (Phase 4 limit).** Sending email needs a
custom domain + a sender service, which the site does not have yet.
Signed-in users can change their password in Settings; a locked-out
user must contact support. A reset email is a documented follow-up
for when a domain exists — do not promise it to readers meanwhile.

**Fix Info & Support.** Reader reports and support messages land in
the D1 tables `fix_reports` and `support_messages`; if the Worker has
`TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_ID` set, they also arrive in
Telegram. Check the tables in the D1 console (or the Telegram
messages) and mark fix reports `fixed`/`rejected` there.

---

## Overflow storage (when the main repo fills up)

GitHub Pages caps a site at ~1 GB. Book files can overflow into the
companion storage repos — each another free 1 GB with Pages enabled. Two
exist so far, used in this order (more numbered ones can be created the
same way whenever needed):

1. **MDTowfiqul/our-boighar-files** → https://mdtowfiqul.github.io/our-boighar-files/
2. **MDTowfiqul/our-boighar-files-1** → https://mdtowfiqul.github.io/our-boighar-files-1/

To host a book's file in one of them:

1. Upload the ebook to `books/` **in that storage repo**.
2. In this repo's `_books/<slug>.md`, set the full URL as `file:`:

```yaml
file: "https://mdtowfiqul.github.io/our-boighar-files-1/books/<filename>.epub"
```

The templates accept a full URL in `file:` (anything containing `://` is used
as-is; plain `/books/...` paths stay local). Covers and metadata always stay
in the main repo.
