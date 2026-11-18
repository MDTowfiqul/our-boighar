---
layout: null
---
/* Our Boighar service worker — xKAF Phase 2 (Reader + OPDS).
   Caches the site shell + the EPUBs a reader opens, so a book that was
   opened once keeps working offline. Version the cache name (OB_CACHE)
   on any shell change; old caches are deleted on activate.
   Rules: same-origin GET only; navigations are network-first (new books
   never go stale); EPUBs and images are cache-first; everything else is
   network-first with a cache fallback. Nothing is uploaded anywhere. */
var OB_CACHE = 'our-boighar-v1';
var SHELL = [
  '{{ '/' | relative_url }}',
  '{{ '/browse/' | relative_url }}',
  '{{ '/shelf/' | relative_url }}',
  '{{ '/tools/' | relative_url }}',
  '{{ '/reader.html' | relative_url }}',
  '{{ '/opds/' | relative_url }}',
  '{{ '/offline.html' | relative_url }}'
];
var MAX_EPUBS = 5;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(OB_CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    }).catch(function () { /* offline on first visit: ignore */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== OB_CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isEpub(url) { return /\.epub(\?|$)/i.test(url.pathname); }
function isImage(url) { return /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(url.pathname); }

function trimEpubs(cache) {
  return cache.keys().then(function (keys) {
    var epubs = keys.filter(function (r) { return isEpub(new URL(r.url)); });
    var extra = epubs.slice(0, Math.max(0, epubs.length - MAX_EPUBS));
    return Promise.all(extra.map(function (r) { return cache.delete(r); }));
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* CDN fonts/libs: pass through */

  /* Navigations (pages): network first, so new books and lists are never stale. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(OB_CACHE).then(function (cache) { cache.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('{{ '/offline.html' | relative_url }}');
        });
      })
    );
    return;
  }

  /* EPUBs + images: cache first (offline reading), refresh in the background. */
  if (isEpub(url) || isImage(url)) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(OB_CACHE).then(function (cache) {
              cache.put(req, copy).then(function () { if (isEpub(url)) trimEpubs(cache); });
            });
          }
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      })
    );
    return;
  }

  /* Everything else same-origin (search.json, popular.json, CSS/JS): network first. */
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(OB_CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () { return caches.match(req); })
  );
});
