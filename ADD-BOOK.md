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
| `toc` | optional list of contents entries; renders a সূচিপত্র (table of contents) section |

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
