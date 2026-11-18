// Our Boighar account client — talks to the Cloudflare Worker API.
// Loaded on dashboard, book and reader pages. No dependencies.
// Config comes from window.OB_CONFIG (emitted by the page from _config.yml):
//   { apiBase: 'https://our-boighar-api.<subdomain>.workers.dev', turnstileSiteKey: '' }
(function () {
  var CFG = window.OB_CONFIG || {};
  var BASE = (CFG.apiBase || 'https://our-boighar-api.towfiqulislam1010.workers.dev').replace(/\/$/, '');
  var SITE_KEY = CFG.turnstileSiteKey || '';

  var meCache = null;      // null = unknown, false = signed out, object = signed in
  var mePromise = null;

  // Bearer-token fallback for the session: the Worker sets an HttpOnly
  // cookie, but browsers that block third-party cookies withhold it on
  // cross-site fetch from github.io to workers.dev, so the dashboard
  // would always look signed out. The token (same 256-bit session token
  // as the cookie) is therefore also kept in localStorage and sent as an
  // Authorization header. The cookie stays the primary mechanism where
  // third-party cookies are allowed.
  var TOKEN_KEY = 'ob_api_token';
  function storedToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(t) {
    try { if (t) localStorage.setItem(TOKEN_KEY, t); } catch (e) {}
  }
  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }
  // Pick up the session token from the post-login redirect fragment
  // (#session=...) and strip it from the address bar at once.
  (function () {
    try {
      var m = /(?:^|&)session=([A-Za-z0-9]+)/.exec(location.hash.slice(1));
      if (m) {
        setToken(m[1]);
        if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
      }
    } catch (e) {}
  })();

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    var tok = storedToken();
    if (tok) headers.Authorization = 'Bearer ' + tok;
    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      credentials: 'include',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var e = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
          e.status = res.status; e.data = data;
          throw e;
        }
        return data;
      });
    });
  }

  function getMe(force) {
    if (!force && meCache !== null) return Promise.resolve(meCache === false ? null : meCache);
    if (!force && mePromise) return mePromise;
    mePromise = api('/api/auth/me').then(function (d) {
      meCache = d.user; mePromise = null; return meCache;
    }).catch(function (e) {
      if (e.status === 401) { meCache = false; mePromise = null; return null; }
      mePromise = null; throw e;
    });
    return mePromise;
  }

  function clearMe() { meCache = null; mePromise = null; }

  // Turnstile: renders the widget into #turnstile-box if a site key is configured.
  // Returns a Promise of the token, or '' when Turnstile is not configured.
  var turnstileReady = null;
  function getTurnstileToken() {
    if (!SITE_KEY) return Promise.resolve('');
    if (!turnstileReady) {
      turnstileReady = new Promise(function (resolve) {
        if (window.turnstile) return resolve();
        var s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true; s.defer = true;
        s.onload = function () { resolve(); };
        s.onerror = function () { resolve(); };
        document.head.appendChild(s);
      });
    }
    return turnstileReady.then(function () {
      return new Promise(function (resolve) {
        var box = document.getElementById('turnstile-box');
        if (!box) return resolve('');
        try {
          box.innerHTML = '';
          window.turnstile.render(box, {
            sitekey: SITE_KEY,
            callback: function (token) { resolve(token); },
            'error-callback': function () { resolve(''); },
            'expired-callback': function () { resolve(''); },
          });
          // Fallback: if no callback fires in 60s, continue without a token.
          setTimeout(function () { resolve(''); }, 60000);
        } catch (e) { resolve(''); }
      });
    });
  }

  // Derive a book_id (slug) from an EPUB file path: /our-boighar/books/<slug>.epub -> <slug>
  function bookIdFromFile(file) {
    if (!file) return '';
    var base = String(file).split('/').pop().split('?')[0];
    return base.replace(/\.epub$/i, '');
  }

  // Sync one reader progress entry to the server (debounced per book).
  var syncTimers = {};
  function syncProgress(file, pct, cfi) {
    var bookId = bookIdFromFile(file);
    if (!bookId) return;
    if (syncTimers[bookId]) clearTimeout(syncTimers[bookId]);
    syncTimers[bookId] = setTimeout(function () {
      getMe().then(function (user) {
        if (!user) return;
        var status = pct >= 100 ? 'finished' : 'reading';
        api('/api/progress', { method: 'POST', body: { book_id: bookId, status: status, percent: pct, cfi: cfi || null } }).catch(function () {});
      }).catch(function () {});
    }, 1500);
  }

  // Sync all local reader progress to the server (called once after sign-in).
  // Returns a Promise of {synced, total}.
  function syncAllLocalProgress() {
    var all = {};
    try { all = JSON.parse(localStorage.getItem('ob-reader-progress') || '{}'); } catch (e) {}
    var entries = Object.keys(all).map(function (file) {
      var p = all[file] || {};
      return { book_id: bookIdFromFile(file), percent: typeof p.pct === 'number' ? p.pct : 0, cfi: p.cfi || null };
    }).filter(function (e) { return e.book_id && (e.percent > 0 || e.cfi); });
    if (!entries.length) return Promise.resolve({ synced: 0, total: 0 });
    var done = 0;
    var chain = Promise.resolve();
    entries.forEach(function (e) {
      chain = chain.then(function () {
        var status = e.percent >= 100 ? 'finished' : 'reading';
        return api('/api/progress', { method: 'POST', body: { book_id: e.book_id, status: status, percent: e.percent, cfi: e.cfi } })
          .then(function () { done++; }).catch(function () {});
      });
    });
    return chain.then(function () { return { synced: done, total: entries.length }; });
  }

  window.OBApi = {
    base: BASE,
    api: api,
    getMe: getMe,
    clearMe: clearMe,
    setToken: setToken,
    clearToken: clearToken,
    getTurnstileToken: getTurnstileToken,
    bookIdFromFile: bookIdFromFile,
    syncProgress: syncProgress,
    syncAllLocalProgress: syncAllLocalProgress,
  };
})();
