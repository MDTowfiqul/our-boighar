# How to add a book to Our Boighar (Jekyll)

The site is a Jekyll site. **Every book is one small Markdown file** in the
`_books/` folder — Jekyll builds its page automatically at
`/books/<filename>/`. You never edit HTML or JSON.

## Steps

1. **Upload the ebook file** (free books only) into the `books/` folder,
   e.g. `books/my-book.epub` (max 100 MB per file).
   *Paid books stay on Gumroad — do not put the full paid file here.*
2. **Add the cover** to `img/`, e.g. `img/cover-my-book.jpg`.
3. **Create `_books/my-book.md`** — copy the template below and fill it in.

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

## Field notes

| Field | Notes |
|---|---|
| `book_id` | unique slug; also used for bookmarks & comments |
| `category` | the main category (used for "related books") |
| `categories` | all tags |
| `alphabet` | first letter of the title — Bengali letter for Bengali titles (ই, ত, র…), capital letter for English ones (A, H…) |
| `file` | omit for paid books; then set `gumroad:` + `price:` instead |
| `file_size`, `year` | optional — shown on the book page when present |

Easiest path: send the ebook file and cover to Muse and ask for the
`_books/*.md` entry — description, tags and alphabet included.
