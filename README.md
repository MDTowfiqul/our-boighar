# Our Boighar — আমাদের বইঘর

The free library of **MD. Towfiqul Islam**: Bengali and English Islamic books, translations and EPUB editions — free to read and download, no account needed.

🌐 Website: https://mdtowfiqul.github.io/our-boighar/

## What is here

- **475 free EPUB books** — Bengali and English Islamic books, with covers, authors, categories and series.
- **Read in the browser** — an EPUB reader with table of contents, bookmarks, reading progress, themes and fonts, notes and highlights, and offline reading.
- **Top 100, Newly Added and For You** — the homepage shows the most-read books, the newest uploads, and suggestions based on what you have read.
- **Authors and Browse** — 316 author pages, plus a browse page with category and author filters and search.
- **Tools** — 10 free browser-only tools at `/tools/`: EPUB reader and metadata viewer, EPUB to text, PDF merge and page extractor, image to PDF, cover resizer, reading planner, word counter and font lab.
- **OPDS catalog** — the whole library as an OPDS feed at `/opds/catalog.xml`, so any OPDS reader can open it. Book pages have an **Open in Our Reader** button that opens the catalog in [Our Reader](https://our-reader.vercel.app).
- **My Dashboard** — optional free account at `/shelf/` (sign in with Google or email): your shelves, reading history, points and ranks, book fix reports and support. Reading, downloading and searching stay free without any account.

## Read a book

1. Open https://mdtowfiqul.github.io/our-boighar/ and pick a book.
2. Tap **Read Online** to read it in the browser, or **Download** to keep the EPUB.
3. To keep your place across devices, sign in on **My Dashboard** and your progress syncs.

To open a book in Our Reader instead, tap **Open in Our Reader** on the book page.

## Request a book or report a mistake

Sign in on **My Dashboard** and use **Fix Info** to report a wrong title, writer, category, cover or file — or **Support** for anything else. You can also open an issue in this repository.

## For maintainers

- **Adding books:** see [ADD-BOOK.md](ADD-BOOK.md). Book entries live in `_books/`, EPUB files in `books/`. The site is a static Jekyll site on GitHub Pages — no server, no database for the site itself.
- **Accounts and dashboard:** the backend is a Cloudflare Worker with a D1 database (`worker/`). After new books are added, the Worker's `books` table must be re-seeded from the built `search.json` — see [ADD-BOOK.md](ADD-BOOK.md#10-accounts--dashboard-xkaf-phase-4--cloudflare-worker--d1) for the steps.
- **Local build:** `bundle exec jekyll build` (or `jekyll build`) from this directory.

## Related projects

- **[Our Reader](https://github.com/MDTowfiqul/our-reader)** — the free ebook reader for this library ([our-reader.vercel.app](https://our-reader.vercel.app))
- **[Our Ebook Maker](https://mdtowfiqul.github.io/our-ebook-maker)** — turn a PDF into an ebook
- **[Our Islamic Archive](https://mdtowfiqul.github.io/our-islamic-archive)** — Islamic resources collection
- **[Our Family](https://mdtowfiqul.github.io/our-family/)** — the hub for all Our projects

## License

The site code is licensed under the [GNU General Public License v3.0](LICENSE). The books themselves belong to their respective writers, translators and publishers, and are shared here for free reading.
