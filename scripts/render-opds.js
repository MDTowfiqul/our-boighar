#!/usr/bin/env node
/* Render the Phase 2 Liquid templates with LiquidJS against the mock site
   dataset (scripts/build-opds-mock-site.py output). Jekyll-compatible
   filters that LiquidJS lacks are registered here to match Jekyll
   semantics; the real Jekyll build on GitHub Pages is still the final
   authority (no Ruby in this sandbox). */
const fs = require('fs');
const path = require('path');
const { Liquid } = require('liquidjs');

const PHASE2 = process.env.PHASE2 || require('path').resolve(__dirname, '..');
const SITE_JSON = process.env.SITE_JSON || '/tmp/opds-verify/site.json';
const OUT = process.env.OUT || '/tmp/opds-verify/out';
const SITE_URL = 'https://mdtowfiqul.github.io';
const BASEURL = '/our-boighar';

const site = JSON.parse(fs.readFileSync(SITE_JSON, 'utf8'));

const engine = new Liquid({
  root: [path.join(PHASE2, '_includes')],
  extname: '.xml',
  strictFilters: false,
  strictVariables: false,
  jekyllInclude: true, // include params arrive as include.* — exactly like Jekyll
});

engine.registerFilter('absolute_url', (input) => {
  const s = String(input == null ? '' : input);
  if (/^https?:\/\//i.test(s)) return s;
  return SITE_URL + BASEURL + (s.startsWith('/') ? s : '/' + s);
});
engine.registerFilter('relative_url', (input) => {
  const s = String(input == null ? '' : input);
  if (/^https?:\/\//i.test(s)) return s;
  return BASEURL + (s.startsWith('/') ? s : '/' + s);
});
engine.registerFilter('date_to_xmlschema', (input) => {
  const d = new Date(input);
  return isNaN(d) ? String(input) : d.toISOString().replace('.000Z', '+00:00');
});
engine.registerFilter('xml_escape', (input) => {
  return String(input == null ? '' : input)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
});
engine.registerFilter('slugify', (input) => {
  // Jekyll slugify, default mode, for the ASCII names used in OPDS templates.
  return String(input == null ? '' : input).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
});
engine.registerFilter('jsonify', (input) => JSON.stringify(input));
engine.registerFilter('url_encode', (input) => encodeURIComponent(String(input == null ? '' : input)));

function stripFrontMatter(text) {
  if (text.startsWith('---\n') || text.startsWith('---\r\n')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) return text.slice(text.indexOf('\n', end + 4) + 1);
  }
  return text;
}

async function renderFile(relPath, scope) {
  const full = path.join(PHASE2, relPath);
  const tpl = stripFrontMatter(fs.readFileSync(full, 'utf8'));
  return engine.parseAndRender(tpl, scope);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const scope = { site };
  const files = fs.readdirSync(path.join(PHASE2, 'opds')).filter((f) => f.endsWith('.xml'));
  for (const f of files) {
    const out = await renderFile(path.join('opds', f), scope);
    fs.writeFileSync(path.join(OUT, f), out);
    console.log(`rendered opds/${f} (${out.length} chars)`);
  }
  // Book pages: sample books covering the tricky category slugs.
  const samples = ['adab-al-mufrad', 'healing-medicine-of-the-prophet'];
  const quranBook = site.books.find((b) => b.category === "Qur'an");
  if (quranBook) samples.push(quranBook.book_id);
  const mannersBook = site.books.find((b) => b.category === 'Manners & Character');
  if (mannersBook) samples.push(mannersBook.book_id);
  for (const id of [...new Set(samples)]) {
    const book = site.books.find((b) => b.book_id === id);
    if (!book) { console.log(`sample ${id} NOT FOUND`); continue; }
    const page = { ...book, content: book.content };
    const out = await renderFile('_layouts/book.html', { site, page });
    fs.writeFileSync(path.join(OUT, `book-${id}.html`), out);
    console.log(`rendered book ${id}`);
  }
  // Service worker (Liquid inside JS) + OPDS guide page body.
  const sw = await renderFile('sw.js', scope);
  fs.writeFileSync(path.join(OUT, 'sw.js'), sw);
  console.log(`rendered sw.js (${sw.length} chars)`);
  const guide = await renderFile('opds/index.html', scope);
  fs.writeFileSync(path.join(OUT, 'opds-index.html'), guide);
  console.log(`rendered opds/index.html (${guide.length} chars)`);
  // Shelf page + default layout (for script checks / jsdom tests).
  const shelf = await renderFile('shelf.html', { site, page: { url: '/shelf/' } });
  fs.writeFileSync(path.join(OUT, 'shelf-rendered.html'), shelf);
  console.log(`rendered shelf.html (${shelf.length} chars)`);
  const def = await renderFile('_layouts/default.html', { site, page: { url: '/', title: 'Test' }, content: '<p>hi</p>' });
  fs.writeFileSync(path.join(OUT, 'default-rendered.html'), def);
  console.log(`rendered default layout (${def.length} chars)`);
}

main().catch((e) => { console.error('RENDER FAILED:', e); process.exit(1); });
