# How to add a book to Our Boighar

The website reads its catalogue from **books.json**. To add a book:

1. **Upload the file** (optional, only for free books): put the `.epub` or `.pdf`
   in the `books/` folder of this repo. Limit: 100 MB per file.
   *Paid books stay on Gumroad — do not put the full paid file here.*
2. **Add the cover** to `img/` (e.g. `img/cover-mybook.jpg`).
3. **Add an entry** to `books.json` — copy an existing entry and change the fields:

| Field | Meaning |
|---|---|
| `id` | short unique slug, e.g. `my-book-bn` |
| `title` | book title (Bengali titles fine) |
| `titleEn` | English version of the title |
| `writer` | the original author of the book, e.g. `Dr. Zakir Naik (lectures)` |
| `creator` | who made this ebook edition (EPUB/PDF), e.g. `MD. Towfiqul Islam (Bengali EPUB edition)` |
| `description` | 2–3 sentence short description |
| `language` | `bn` or `en` |
| `languageLabel` | shown on the card, e.g. `Bengali` |
| `categories` | tags, e.g. `["Dawah", "Islamic Q&A"]` |
| `cover` | path to the cover, e.g. `img/cover-mybook.jpg` |
| `format` | `EPUB` or `PDF` |
| `file` | path to the book file for free downloads, e.g. `books/my-book.epub`, or `null` for paid books |
| `gumroad` | Gumroad product URL, or `null` |
| `price` | e.g. `$100`, or `null` |

That's it — the site rebuilds itself from the list automatically: cards,
language filter, category filter, search, bookmark buttons, the direct
download button, and the online reader (works for EPUB and PDF files).

Tip: the easiest way is to give the book file and cover to Muse and ask for
the description + the `books.json` entry.
