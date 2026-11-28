// Our Boighar API — Cloudflare Worker + D1 (single file, no dependencies).
// Paste into the Cloudflare dashboard editor for Worker `our-boighar-api`
// (same pattern as the Our Family bot). D1 database `our-boighar-db` bound as DB.
// Contract: see API.md in this folder. Secrets: see DEPLOY.md.

const SITE_URL = 'https://mdtowfiqul.github.io/our-boighar';
const COOKIE_NAME = 'ob_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;

// Rank tiers: [minPoints, Bengali name]
const TIERS = [
  [0, 'সন্ধানী'], [10, 'কৌতূহলী'], [25, 'জিজ্ঞাসু'], [50, 'পথিক'], [100, 'যাত্রী'],
  [175, 'বইয়ের বন্ধু'], [250, 'অন্বেষী'], [350, 'জ্ঞানপিপাসু'], [500, 'অধ্যয়নশীল'],
  [700, 'মনোযোগী পাঠক'], [900, 'গভীর পাঠক'], [1150, 'মননশীল'], [1450, 'জ্ঞানসন্ধানী'],
  [1800, 'বিদ্যানুরাগী'], [2200, 'প্রজ্ঞাবান'], [2650, 'জ্ঞানভান্ডার'],
  [3150, 'আলোকিত পাঠক'], [3700, 'দীপশিখা'], [4300, 'আলোকবর্তিকা'], [5000, 'ইলমের ভান্ডার'],
];
const POINTS = { started: 1, finished: 10, rated: 2, shelved: 1, streak: 2, fix: 2 };
const MAX_SHELVES = 10;
const MAX_SHELF_BOOKS = 100;
const DEFAULT_SHELVES = ['পড়ছি', 'পড়বো', 'পড়া হয়েছে'];

// ---------- small helpers ----------
const enc = new TextEncoder();
function hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function randomHex(nBytes) {
  const a = new Uint8Array(nBytes);
  crypto.getRandomValues(a);
  return hex(a);
}
function now() { return Date.now(); }
function dayStart(ts) { const d = new Date(ts); d.setUTCHours(0, 0, 0, 0); return d.getTime(); }

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
function err(message, status = 400) { return json({ error: message }, status); }

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (origin === SITE_URL.replace('/our-boighar', '') || origin === 'https://mdtowfiqul.github.io') return origin;
  if (origin.startsWith('http://localhost:') || origin === 'http://127.0.0.1:4000') return origin;
  if (env.DEV_ORIGIN && origin === env.DEV_ORIGIN) return origin;
  return null;
}
function corsHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  const h = { 'Vary': 'Origin' };
  if (origin) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Credentials'] = 'true';
    // Authorization MUST be listed: the dashboard now sends a Bearer token,
    // which makes the browser preflight (OPTIONS) the request, and a header
    // missing here makes the preflight fail — fetch then rejects with
    // "Failed to fetch" and the dashboard reports "Cannot reach the server".
    h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    h['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
  }
  return h;
}
function withCors(request, env, response) {
  const h = corsHeaders(request, env);
  for (const [k, v] of Object.entries(h)) response.headers.set(k, v);
  return response;
}
function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sessionCookie(token) {
  // SameSite=None: the dashboard lives on mdtowfiqul.github.io while the API
  // is on workers.dev, so the session cookie must be sent on cross-site
  // fetch() calls (credentials:include). Lax would withhold it and the
  // dashboard would always look signed out. None requires Secure (set).
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}
function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
}
async function readBody(request) {
  try {
    const b = await request.json();
    return (b && typeof b === 'object' && !Array.isArray(b)) ? b : null;
  } catch { return null; }
}
function cleanStr(v, max = 200) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}
function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

// ---------- password hashing (PBKDF2-SHA256) ----------
async function hashPassword(password) {
  const salt = randomHex(16);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, 256);
  return salt + '$' + hex(bits);
}
async function verifyPassword(password, stored) {
  if (!stored || !stored.includes('$')) return false;
  const [salt, want] = stored.split('$');
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, 256);
  return hex(bits) === want;
}

// ---------- sessions ----------
async function createSession(env, userId) {
  const token = randomHex(32);
  const t = now();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(token, userId, t, t + SESSION_DAYS * 86400000).run();
  return token;
}
// The session token as the client presented it: HttpOnly cookie first,
// then an Authorization: Bearer token (see getSessionUser).
function presentedToken(request) {
  let token = parseCookies(request)[COOKIE_NAME];
  if (!token) {
    const auth = request.headers.get('Authorization') || '';
    const m = /^Bearer\s+([A-Za-z0-9]+)$/.exec(auth);
    if (m) token = m[1];
  }
  return token || null;
}
async function getSessionUser(request, env) {
  // Session token: HttpOnly cookie first; fall back to an Authorization:
  // Bearer token. The dashboard sends the Bearer header because the
  // cross-site cookie is withheld by browsers that block third-party
  // cookies (the token is the same 256-bit session token as the cookie).
  const token = presentedToken(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT s.user_id, u.id, u.name, u.email, u.password_hash, u.google_id, u.avatar_url, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'
  ).bind(token, now()).first();
  if (!row) return null;
  await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now(), row.id).run();
  return row;
}
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, avatar_url: u.avatar_url || null, has_password: !!u.password_hash, has_google: !!u.google_id, created_at: u.created_at };
}

// ---------- rate limiting (D1, per IP, 60s windows) ----------
async function rateLimited(env, request, scope, limit) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const windowStart = Math.floor(now() / 60000) * 60000;
  await env.DB.prepare(
    'INSERT INTO rate_limits (ip, scope, window_start, count) VALUES (?, ?, ?, 1) ON CONFLICT(ip, scope, window_start) DO UPDATE SET count = count + 1'
  ).bind(ip, scope, windowStart).run();
  const row = await env.DB.prepare(
    'SELECT count FROM rate_limits WHERE ip = ? AND scope = ? AND window_start = ?'
  ).bind(ip, scope, windowStart).first();
  return (row?.count || 0) > limit;
}
async function pruneRateLimits(env) {
  try {
    await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now() - 300000).run();
    await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()).run();
    await env.DB.prepare('DELETE FROM oauth_states WHERE created_at < ?').bind(now() - 600000).run();
  } catch { /* best effort */ }
}

// ---------- Turnstile (skipped when not configured — see API.md) ----------
async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip || '' }),
    });
    const data = await res.json();
    return data.success === true;
  } catch { return false; }
}

// ---------- points / history ----------
async function awardPoints(env, userId, reason, bookId) {
  const pts = POINTS[reason];
  if (!pts) return;
  if (reason === 'streak') {
    const today = dayStart(now());
    const exists = await env.DB.prepare(
      "SELECT id FROM points WHERE user_id = ? AND reason = 'streak' AND created_at >= ?"
    ).bind(userId, today).first();
    if (exists) return;
  } else if (bookId) {
    const exists = await env.DB.prepare(
      'SELECT id FROM points WHERE user_id = ? AND reason = ? AND book_id = ?'
    ).bind(userId, reason, bookId).first();
    if (exists) return;
  }
  await env.DB.prepare(
    'INSERT INTO points (user_id, reason, points, book_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, reason, pts, bookId || null, now()).run();
}
async function logHistory(env, userId, bookId, event, detail) {
  await env.DB.prepare(
    'INSERT INTO history (user_id, book_id, event, detail, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, bookId || null, event, detail || null, now()).run();
}
async function bookExists(env, bookId) {
  const row = await env.DB.prepare('SELECT id FROM books WHERE id = ?').bind(bookId).first();
  return !!row;
}
function rankFor(points) {
  let tier = 0, name = TIERS[0][1];
  for (let i = 0; i < TIERS.length; i++) {
    if (points >= TIERS[i][0]) { tier = i; name = TIERS[i][1]; }
  }
  const next = tier + 1 < TIERS.length ? TIERS[tier + 1][0] : null;
  return { tier: tier + 1, name, points, next_tier_at: next };
}

// ---------- Telegram forward for reports (fix reports + support) ----------
// Reports go to the "Issue/Report a Problem" topic (id 39) of the Our Family
// Telegram group via @our_boighar_bot — the same bot/chat the new-book
// announcements use (TELEGRAM_CHAT_ID / TELEGRAM_TOPIC_ID there).
// Env overrides: TELEGRAM_REPORT_CHAT_ID, TELEGRAM_REPORT_TOPIC_ID.
// The defaults are the live group/topic so reports work even before the
// secrets are set; TELEGRAM_BOT_TOKEN is still required.
const REPORT_CHAT_ID = '-1004423692844'; // Our Family group (@Our_Family_bd)
const REPORT_TOPIC_ID = 39;              // "Issue/Report a Problem"
async function forwardReportToTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  try {
    const payload = {
      chat_id: env.TELEGRAM_REPORT_CHAT_ID || REPORT_CHAT_ID,
      text: text.slice(0, 4000),
    };
    const topic = parseInt(env.TELEGRAM_REPORT_TOPIC_ID || String(REPORT_TOPIC_ID), 10);
    if (topic) payload.message_thread_id = topic;
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch { /* never fail the user request */ }
}

// ---------- auth handlers ----------
async function handleGoogleStart(request, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return err('Google sign-in is not set up yet. Use email sign-in for now.', 503);
  }
  const state = randomHex(16);
  await env.DB.prepare('INSERT INTO oauth_states (state, created_at) VALUES (?, ?)').bind(state, now()).run();
  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: origin + '/api/auth/google/callback',
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    state,
  });
  return Response.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString(), 302);
}

async function handleGoogleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const fail = (msg) => Response.redirect(SITE_URL + '/dashboard/?login=error&msg=' + encodeURIComponent(msg), 302);
  if (error) return fail('Google sign-in was cancelled.');
  if (!code || !state) return fail('Missing code from Google.');
  const saved = await env.DB.prepare('SELECT state FROM oauth_states WHERE state = ? AND created_at > ?')
    .bind(state, now() - 600000).first();
  if (!saved) return fail('Sign-in session expired. Please try again.');
  await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return fail('Google sign-in is not set up yet.');
  const origin = url.origin;
  // Exchange the code for tokens.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: origin + '/api/auth/google/callback',
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokens.access_token) return fail('Google did not return an access token.');
  const meRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: 'Bearer ' + tokens.access_token },
  });
  const profile = await meRes.json();
  if (!profile.sub || !profile.email) return fail('Google did not return your profile.');
  const email = String(profile.email).toLowerCase();
  const name = cleanStr(profile.name || email.split('@')[0], 60) || 'Reader';
  const t = now();
  let user = await env.DB.prepare('SELECT * FROM users WHERE google_id = ?').bind(profile.sub).first();
  if (!user) {
    user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (user) {
      await env.DB.prepare('UPDATE users SET google_id = ?, avatar_url = ?, last_seen_at = ? WHERE id = ?')
        .bind(profile.sub, profile.picture || null, t, user.id).run();
      user.google_id = profile.sub;
    }
  }
  if (!user) {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO users (id, name, email, password_hash, google_id, avatar_url, created_at, last_seen_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)'
    ).bind(id, name, email, profile.sub, profile.picture || null, t, t).run();
    user = { id, name, email, google_id: profile.sub, avatar_url: profile.picture || null, created_at: t };
    for (const shelfName of DEFAULT_SHELVES) {
      await env.DB.prepare('INSERT INTO shelves (id, user_id, name, created_at) VALUES (?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, shelfName, t).run();
    }
  } else {
    await env.DB.prepare('UPDATE users SET last_seen_at = ?, avatar_url = COALESCE(?, avatar_url) WHERE id = ?')
      .bind(t, profile.picture || null, user.id).run();
  }
  const token = await createSession(env, user.id);
  // NOTE: never `Response.redirect(...).headers.set(...)` — a redirect
  // response has immutable headers and .set() throws TypeError ("immutable"),
  // which is exactly what crashed this callback after the session was made.
  // Build the redirect with `new Response` so the cookie can be attached.
  return new Response(null, {
    status: 302,
    headers: {
      // The session token also rides in the URL fragment (#session=...):
      // fragments are never sent to any server, and the dashboard reads
      // the token from it into localStorage, because the cross-site
      // cookie alone is withheld by browsers that block third-party
      // cookies (the dashboard then authenticates with a Bearer header).
      Location: SITE_URL + '/dashboard/?login=ok#session=' + token,
      'Set-Cookie': sessionCookie(token),
    },
  });
}

async function handleRegister(request, env) {
  const body = await readBody(request);
  if (!body) return err('Invalid request.');
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!(await verifyTurnstile(env, body.turnstile, ip))) return err('Please complete the human check and try again.', 403);
  const name = cleanStr(body.name, 60);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!name) return err('Please enter your name.');
  if (!isEmail(email)) return err('Please enter a valid email address.');
  if (password.length < 8) return err('Password must be at least 8 characters.');
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return err('An account with this email already exists. Try signing in.', 409);
  const id = crypto.randomUUID();
  const t = now();
  const hash = await hashPassword(password);
  await env.DB.prepare(
    'INSERT INTO users (id, name, email, password_hash, google_id, avatar_url, created_at, last_seen_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)'
  ).bind(id, name, email, hash, t, t).run();
  for (const shelfName of DEFAULT_SHELVES) {
    await env.DB.prepare('INSERT INTO shelves (id, user_id, name, created_at) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), id, shelfName, t).run();
  }
  const token = await createSession(env, id);
  return json({ user: { id, name, email, avatar_url: null, has_password: true, has_google: false, created_at: t }, token },
    201, { 'Set-Cookie': sessionCookie(token) });
}

async function handleLogin(request, env) {
  const body = await readBody(request);
  if (!body) return err('Invalid request.');
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!(await verifyTurnstile(env, body.turnstile, ip))) return err('Please complete the human check and try again.', 403);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!isEmail(email) || !password) return err('Enter your email and password.');
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user || !user.password_hash) return err('No account found with this email, or it was created with Google. Try Google sign-in.', 401);
  if (!(await verifyPassword(password, user.password_hash))) return err('Wrong password. Please try again.', 401);
  const token = await createSession(env, user.id);
  return json({ user: publicUser(user), token }, 200, { 'Set-Cookie': sessionCookie(token) });
}

async function handleLogout(request, env) {
  const token = presentedToken(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
}

async function handleChangePassword(request, env, user) {
  const body = await readBody(request);
  if (!body) return err('Invalid request.');
  const current = typeof body.current === 'string' ? body.current : '';
  const next = typeof body.next === 'string' ? body.next : '';
  if (next.length < 8) return err('New password must be at least 8 characters.');
  const full = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  if (full.password_hash) {
    if (!(await verifyPassword(current, full.password_hash))) return err('Current password is wrong.', 401);
  }
  const hash = await hashPassword(next);
  await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, user.id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  const token = await createSession(env, user.id);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
}

async function handleDeleteAccount(request, env, user) {
  const body = await readBody(request);
  if (!body) return err('Invalid request.');
  const full = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  if (full.password_hash) {
    const pw = typeof body.password === 'string' ? body.password : '';
    if (!(await verifyPassword(pw, full.password_hash))) return err('Wrong password.', 401);
  } else if (body.confirm !== true) {
    return err('Please confirm account deletion.', 400);
  }
  // ON DELETE CASCADE clears sessions, shelves, shelf_books, book_status, history, points, fix_reports.
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
}

// ---------- shelves ----------
async function handleListShelves(env, user) {
  const shelves = await env.DB.prepare(
    'SELECT id, name, created_at FROM shelves WHERE user_id = ? ORDER BY created_at ASC'
  ).bind(user.id).all();
  const out = [];
  for (const s of shelves.results || []) {
    const books = await env.DB.prepare(
      'SELECT sb.book_id, b.title FROM shelf_books sb JOIN books b ON b.id = sb.book_id WHERE sb.shelf_id = ? ORDER BY sb.added_at ASC'
    ).bind(s.id).all();
    out.push({ id: s.id, name: s.name, created_at: s.created_at, books: (books.results || []).map(b => ({ book_id: b.book_id, title: b.title })) });
  }
  return json({ shelves: out });
}

async function handleCreateShelf(request, env, user) {
  const body = await readBody(request);
  if (!body) return err('Invalid request.');
  const name = cleanStr(body.name, 40);
  if (!name) return err('Please name the shelf.');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM shelves WHERE user_id = ?').bind(user.id).first();
  if ((count?.n || 0) >= MAX_SHELVES) return err(`You can have at most ${MAX_SHELVES} shelves.`, 400);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO shelves (id, user_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, user.id, name, now()).run();
  return json({ shelf: { id, name, created_at: now(), books: [] } }, 201);
}

async function handleDeleteShelf(env, user, shelfId) {
  const shelf = await env.DB.prepare('SELECT id FROM shelves WHERE id = ? AND user_id = ?').bind(shelfId, user.id).first();
  if (!shelf) return err('Shelf not found.', 404);
  await env.DB.prepare('DELETE FROM shelves WHERE id = ?').bind(shelfId).run();
  return json({ ok: true });
}

async function handleAddShelfBook(request, env, user, shelfId) {
  const body = await readBody(request);
  if (!body) return err('Invalid request.');
  const bookId = cleanStr(body.book_id, 120);
  if (!bookId || !(await bookExists(env, bookId))) return err('Book not found.', 404);
  const shelf = await env.DB.prepare('SELECT id FROM shelves WHERE id = ? AND user_id = ?').bind(shelfId, user.id).first();
  if (!shelf) return err('Shelf not found.', 404);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM shelf_books WHERE shelf_id = ?').bind(shelfId).first();
  if ((count?.n || 0) >= MAX_SHELF_BOOKS) return err(`A shelf holds at most ${MAX_SHELF_BOOKS} books.`, 400);
  const exists = await env.DB.prepare('SELECT 1 FROM shelf_books WHERE shelf_id = ? AND book_id = ?').bind(shelfId, bookId).first();
  if (exists) return err('This book is already on that shelf.', 409);
  await env.DB.prepare('INSERT INTO shelf_books (shelf_id, book_id, added_at) VALUES (?, ?, ?)').bind(shelfId, bookId, now()).run();
  await awardPoints(env, user.id, 'shelved', bookId);
  await logHistory(env, user.id, bookId, 'shelved', null);
  return json({ ok: true }, 201);
}

async function handleRemoveShelfBook(env, user, shelfId, bookId) {
  const shelf = await env.DB.prepare('SELECT id FROM shelves WHERE id = ? AND user_id = ?').bind(shelfId, user.id).first();
  if (!shelf) return err('Shelf not found.', 404);
  await env.DB.prepare('DELETE FROM shelf_books WHERE shelf_id = ? AND book_id = ?').bind(shelfId, bookId).run();
  await logHistory(env, user.id, bookId, 'unshelved', null);
  return json({ ok: true });
}

// ---------- progress + history + stats ----------
async function handleProgress(request, env, user) {
  const body = await readBody(request);
  if (!body) return err('Invalid request.');
  const bookId = cleanStr(body.book_id, 120);
  if (!bookId || !(await bookExists(env, bookId))) return err('Book not found.', 404);
  const status = body.status;
  if (status && !['reading', 'want', 'finished'].includes(status)) return err('Invalid status.', 400);
  const percent = Math.max(0, Math.min(100, parseInt(body.percent, 10) || 0));
  const cfi = typeof body.cfi === 'string' ? body.cfi.slice(0, 500) : null;
  const t = now();
  const prev = await env.DB.prepare('SELECT status FROM book_status WHERE user_id = ? AND book_id = ?').bind(user.id, bookId).first();
  const newStatus = status || prev?.status || 'reading';
  await env.DB.prepare(
    'INSERT INTO book_status (user_id, book_id, status, percent, cfi, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, book_id) DO UPDATE SET status = excluded.status, percent = excluded.percent, cfi = COALESCE(excluded.cfi, cfi), updated_at = excluded.updated_at'
  ).bind(user.id, bookId, newStatus, percent, cfi, t).run();
  if (!prev) {
    await awardPoints(env, user.id, 'started', bookId);
    await logHistory(env, user.id, bookId, 'started', null);
  }
  if (newStatus === 'finished' && prev?.status !== 'finished') {
    await awardPoints(env, user.id, 'finished', bookId);
    await logHistory(env, user.id, bookId, 'finished', null);
  } else if (newStatus !== 'finished') {
    await logHistory(env, user.id, bookId, 'progress', percent + '%');
  }
  await awardPoints(env, user.id, 'streak', null);
  return json({ ok: true, status: newStatus, percent });
}

async function handleGetProgress(request, env, user) {
  const url = new URL(request.url);
  const bookId = url.searchParams.get('book_id');
  if (bookId) {
    const row = await env.DB.prepare(
      'SELECT bs.*, b.title FROM book_status bs JOIN books b ON b.id = bs.book_id WHERE bs.user_id = ? AND bs.book_id = ?'
    ).bind(user.id, bookId).first();
    return json({ progress: row || null });
  }
  const rows = await env.DB.prepare(
    'SELECT bs.*, b.title FROM book_status bs JOIN books b ON b.id = bs.book_id WHERE bs.user_id = ? ORDER BY bs.updated_at DESC LIMIT 200'
  ).bind(user.id).all();
  return json({ progress: rows.results || [] });
}

async function handleHistory(request, env, user) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit'), 10) || 50));
  const rows = await env.DB.prepare(
    'SELECT h.id, h.book_id, b.title, h.event, h.detail, h.created_at FROM history h LEFT JOIN books b ON b.id = h.book_id WHERE h.user_id = ? ORDER BY h.created_at DESC LIMIT ?'
  ).bind(user.id, limit).all();
  return json({ history: rows.results || [] });
}

async function handleStats(env, user) {
  const counts = await env.DB.prepare(
    "SELECT status, COUNT(*) AS n FROM book_status WHERE user_id = ? GROUP BY status"
  ).bind(user.id).all();
  const byStatus = { reading: 0, want: 0, finished: 0 };
  for (const r of counts.results || []) byStatus[r.status] = r.n;
  const rated = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM history WHERE user_id = ? AND event = 'rated'"
  ).bind(user.id).first();
  const pts = await env.DB.prepare(
    'SELECT COALESCE(SUM(points), 0) AS total FROM points WHERE user_id = ?'
  ).bind(user.id).first();
  const total = pts?.total || 0;
  // Streak: consecutive days (UTC) with a reading event, ending today or yesterday.
  const days = await env.DB.prepare(
    "SELECT DISTINCT CAST(created_at / 86400000 AS INTEGER) AS d FROM history WHERE user_id = ? AND event IN ('started','progress','finished') ORDER BY d DESC LIMIT 370"
  ).bind(user.id).all();
  const daySet = new Set((days.results || []).map(r => r.d));
  const today = Math.floor(now() / 86400000);
  let streak = 0;
  let cursor = daySet.has(today) ? today : today - 1;
  while (daySet.has(cursor)) { streak++; cursor--; }
  return json({
    stats: {
      reading: byStatus.reading, want: byStatus.want, finished: byStatus.finished,
      rated: rated?.n || 0, total_points: total, rank: rankFor(total),
      streak_days: streak, reading_days: daySet.size,
    },
  });
}

async function handleRanking(request, env) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit'), 10) || 20));
  const rows = await env.DB.prepare(
    'SELECT u.name, COALESCE(SUM(p.points), 0) AS total FROM users u LEFT JOIN points p ON p.user_id = u.id GROUP BY u.id ORDER BY total DESC, u.created_at ASC LIMIT ?'
  ).bind(limit).all();
  const ranking = (rows.results || []).map((r, i) => ({
    place: i + 1, name: r.name, points: r.total, rank: rankFor(r.total).name,
  }));
  return json({ ranking });
}

// ---------- public OPDS search ----------
// GET /api/opds/search?q=<term> — Atom acquisition feed of matching books.
// This is what Our Reader calls from its OPDS search box: the catalog feeds
// carry rel="search" (type application/atom+xml, href
// .../api/opds/search?q={searchTerms}), Our Reader replaces {searchTerms}
// with the typed query and fetches this URL (server-side, through its own
// proxy — no browser CORS involved). Public: no sign-in.
// Entries mirror _includes/opds-entry.xml. The D1 books table only stores
// id/title/writer/category/language, so cover, EPUB file and page URLs are
// derived from the site conventions: every book's file is /books/<id>.epub
// and its cover /img/cover-<id>.jpg (verified across all 479 books, with
// the one exception listed in OPDS_COVER_EXCEPTIONS). The D1 table holds no
// description, so <summary> is the writer + categories line.
const OPDS_SEARCH_LIMIT = 50;
const OPDS_COVER_EXCEPTIONS = { 'islam-objections-bn': '/img/cover.jpg' };
function xmlEscape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
  });
}
function opdsSlug(s) {
  return String(s || '').toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function opdsEntry(row, updated) {
  const page = SITE_URL + '/books/' + row.id + '/';
  const cover = SITE_URL + (OPDS_COVER_EXCEPTIONS[row.id] || ('/img/cover-' + row.id + '.jpg'));
  const cats = String(row.category || '').split(',').map(function (c) { return c.trim(); }).filter(Boolean);
  const summary = [row.writer, row.category].filter(Boolean).join(' · ');
  return '  <entry>\n' +
    '    <title>' + xmlEscape(row.title) + '</title>\n' +
    '    <id>' + xmlEscape(page) + '</id>\n' +
    '    <updated>' + updated + '</updated>\n' +
    '    <author><name>' + xmlEscape(row.writer || '') + '</name></author>\n' +
    '    <dc:creator>' + xmlEscape(row.writer || '') + '</dc:creator>\n' +
    '    <dc:identifier>' + xmlEscape(row.id) + '</dc:identifier>\n' +
    '    <dc:language>' + xmlEscape(row.language || '') + '</dc:language>\n' +
    (summary ? '    <summary type="text">' + xmlEscape(summary) + '</summary>\n' : '') +
    cats.map(function (c) { return '    <category term="' + xmlEscape(opdsSlug(c)) + '" label="' + xmlEscape(c) + '"/>\n'; }).join('') +
    '    <link rel="http://opds-spec.org/image" type="image/jpeg" href="' + xmlEscape(cover) + '"/>\n' +
    '    <link rel="http://opds-spec.org/image/thumbnail" type="image/jpeg" href="' + xmlEscape(cover) + '"/>\n' +
    '    <link rel="alternate" type="text/html" href="' + xmlEscape(page) + '"/>\n' +
    '    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="' + xmlEscape(SITE_URL + '/books/' + row.id + '.epub') + '"/>\n' +
    '  </entry>\n';
}
async function handleOpdsSearch(request, env) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const updated = new Date().toISOString();
  const selfHref = url.origin + '/api/opds/search?q=' + encodeURIComponent(q);
  const searchHref = url.origin + '/api/opds/search?q={searchTerms}';
  let rows = [];
  if (q) {
    // Escape LIKE wildcards so a typed % or _ matches literally.
    const like = '%' + q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
    const res = await env.DB.prepare(
      "SELECT id, title, writer, category, language FROM books WHERE title LIKE ? ESCAPE '\\' OR writer LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' ORDER BY title ASC LIMIT ?"
    ).bind(like, like, like, OPDS_SEARCH_LIMIT).all();
    rows = res.results || [];
  }
  const title = q ? 'Search results for "' + q + '"' : 'Search Our Boighar';
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog">\n' +
    '  <id>' + xmlEscape(selfHref) + '</id>\n' +
    '  <title>' + xmlEscape(title) + '</title>\n' +
    '  <updated>' + updated + '</updated>\n' +
    '  <author><name>Our Boighar</name><uri>' + xmlEscape(SITE_URL) + '</uri></author>\n' +
    '  <link rel="self" type="application/atom+xml;profile=opds-catalog;kind=acquisition" href="' + xmlEscape(selfHref) + '"/>\n' +
    '  <link rel="start" type="application/atom+xml;profile=opds-catalog;kind=navigation" title="Our Boighar OPDS Catalog" href="' + xmlEscape(SITE_URL + '/opds/catalog.xml') + '"/>\n' +
    '  <link rel="search" type="application/atom+xml" title="Search Our Boighar" href="' + xmlEscape(searchHref) + '"/>\n' +
    rows.map(function (r) { return opdsEntry(r, updated); }).join('') +
    '</feed>\n';
  return new Response(xml, { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' } });
}

// ---------- fix reports + support ----------
const FIX_FIELDS = ['title', 'writer', 'creator', 'category', 'language', 'cover', 'file', 'other'];

async function handleFixReport(request, env, user) {
  const body = await readBody(request);
  if (!body) return err('Invalid request.');
  const bookId = cleanStr(body.book_id, 120);
  // The report form no longer asks which field is wrong (2 boxes only:
  // book + what's wrong) — anything sent without a valid field is 'other'.
  const rawField = cleanStr(body.field, 20);
  const field = FIX_FIELDS.includes(rawField) ? rawField : 'other';
  const message = cleanStr(body.message, 2000);
  if (!bookId || !(await bookExists(env, bookId))) return err('Book not found.', 404);
  if (!message) return err('Please describe what is wrong.');
  const res = await env.DB.prepare(
    'INSERT INTO fix_reports (user_id, book_id, field, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(user.id, bookId, field, message, 'open', now()).run();
  await awardPoints(env, user.id, 'fix', bookId);
  const book = await env.DB.prepare('SELECT title FROM books WHERE id = ?').bind(bookId).first();
  forwardReportToTelegram(env, `Boighar fix report\nBook: ${book?.title || bookId}\nLink: ${SITE_URL}/books/${bookId}/\nField: ${field}\nFrom: ${user.name} (${user.email})\n${message}`);
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

async function handleMyFixReports(env, user) {
  const rows = await env.DB.prepare(
    'SELECT f.id, f.book_id, b.title, f.field, f.message, f.status, f.created_at FROM fix_reports f JOIN books b ON b.id = f.book_id WHERE f.user_id = ? ORDER BY f.created_at DESC LIMIT 50'
  ).bind(user.id).all();
  return json({ reports: rows.results || [] });
}

async function handleSupport(request, env, user) {
  const body = await readBody(request);
  if (!body) return err('Invalid request.');
  const subject = cleanStr(body.subject, 120);
  const message = cleanStr(body.message, 3000);
  if (!message) return err('Please write your message.');
  await env.DB.prepare(
    'INSERT INTO support_messages (user_id, subject, message, created_at) VALUES (?, ?, ?, ?)'
  ).bind(user.id, subject || null, message, now()).run();
  forwardReportToTelegram(env, `Boighar support\nFrom: ${user.name} (${user.email})\nSubject: ${subject || '(none)'}\n${message}`);
  return json({ ok: true }, 201);
}

// ---------- native comments + Like (Like ONLY, no other reactions) ----------
// Tables are created by the Worker itself (CREATE TABLE IF NOT EXISTS) on
// the first request to these endpoints, so no manual D1 step is needed.
//   comments: id, book_id, user_id, name, text, created_at
//   likes:    book_id, user_id, created_at — PRIMARY KEY (book_id, user_id)
//             enforces one like per user per book (the UNIQUE(book_id, user_id)).
const COMMENT_MAX_LEN = 2000;
const COMMENTS_PER_HOUR = 10;
const OWNER_EMAIL = 'towfiqulislam1010@gmail.com';

async function ensureCommentsLikesTables(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id TEXT NOT NULL REFERENCES books(id), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL)'
  ).run();
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS likes (book_id TEXT NOT NULL REFERENCES books(id), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, PRIMARY KEY (book_id, user_id))'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_comments_book ON comments(book_id, created_at DESC)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_likes_book ON likes(book_id)'
  ).run();
}

async function handleGetComments(env, bookId, user) {
  await ensureCommentsLikesTables(env);
  const rows = await env.DB.prepare(
    'SELECT id, user_id, name, text, created_at FROM comments WHERE book_id = ? ORDER BY created_at DESC, id DESC LIMIT 200'
  ).bind(bookId).all();
  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM likes WHERE book_id = ?'
  ).bind(bookId).first();
  // `liked` reflects the current user; false when signed out.
  let liked = false;
  if (user) {
    const row = await env.DB.prepare(
      'SELECT 1 AS x FROM likes WHERE book_id = ? AND user_id = ?'
    ).bind(bookId, user.id).first();
    liked = !!row;
  }
  return json({
    comments: rows.results || [],
    likes: { count: countRow?.n || 0, liked },
  });
}

async function handlePostComment(request, env, user, bookId) {
  await ensureCommentsLikesTables(env);
  if (!(await bookExists(env, bookId))) return err('Book not found.', 404);
  const body = await readBody(request);
  if (!body) return err('Invalid request.');
  // Name always comes from the session — any name the client sends is ignored.
  const text = cleanStr(body.text, COMMENT_MAX_LEN);
  if (!text) return err('Please write a comment.');
  // Light per-user rate limit: max 10 comments per user per hour.
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM comments WHERE user_id = ? AND created_at > ?'
  ).bind(user.id, now() - 3600000).first();
  if ((recent?.n || 0) >= COMMENTS_PER_HOUR) {
    return err('You are commenting too fast. Please wait a while before posting again.', 429);
  }
  const t = now();
  const res = await env.DB.prepare(
    'INSERT INTO comments (book_id, user_id, name, text, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(bookId, user.id, user.name, text, t).run();
  return json({ id: res.meta.last_row_id, user_id: user.id, name: user.name, text, created_at: t }, 201);
}

async function handleToggleLike(env, user, bookId) {
  await ensureCommentsLikesTables(env);
  if (!(await bookExists(env, bookId))) return err('Book not found.', 404);
  const existing = await env.DB.prepare(
    'SELECT 1 AS x FROM likes WHERE book_id = ? AND user_id = ?'
  ).bind(bookId, user.id).first();
  let liked;
  if (existing) {
    await env.DB.prepare('DELETE FROM likes WHERE book_id = ? AND user_id = ?').bind(bookId, user.id).run();
    liked = false;
  } else {
    await env.DB.prepare(
      'INSERT INTO likes (book_id, user_id, created_at) VALUES (?, ?, ?)'
    ).bind(bookId, user.id, now()).run();
    liked = true;
  }
  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM likes WHERE book_id = ?'
  ).bind(bookId).first();
  return json({ count: countRow?.n || 0, liked });
}

async function handleDeleteComment(env, user, bookId, commentId) {
  await ensureCommentsLikesTables(env);
  const id = parseInt(commentId, 10);
  if (!Number.isFinite(id)) return err('Comment not found.', 404);
  const row = await env.DB.prepare(
    'SELECT user_id FROM comments WHERE id = ? AND book_id = ?'
  ).bind(id, bookId).first();
  if (!row) return err('Comment not found.', 404);
  const isOwner = String(user.email || '').toLowerCase() === OWNER_EMAIL;
  if (!isOwner && row.user_id !== user.id) {
    return err('You can only delete your own comments.', 403);
  }
  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// ---------- router ----------
function route(path) {
  // returns [handler-group, params]
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'api') return null;
  return parts.slice(1);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    // CORS preflight
    if (method === 'OPTIONS') {
      return withCors(request, env, new Response(null, { status: 204 }));
    }
    const finish = (res) => withCors(request, env, res);
    try {
      // Health / root
      if (url.pathname === '/' || url.pathname === '/api/health') {
        return finish(json({ ok: true, service: 'our-boighar-api', time: new Date().toISOString() }));
      }
      const parts = route(url.pathname);
      if (!parts) return finish(err('Not found.', 404));

      // Rate limits: stricter on auth writes.
      const isAuthWrite = parts[0] === 'auth' && (parts[1] === 'register' || parts[1] === 'login') && method === 'POST';
      if (isAuthWrite && (await rateLimited(env, request, 'auth', 5))) {
        return finish(json({ error: 'Too many attempts. Please wait a minute and try again.' }, 429, { 'Retry-After': '60' }));
      }
      if (await rateLimited(env, request, 'general', 60)) {
        return finish(json({ error: 'Too many requests. Please slow down.' }, 429, { 'Retry-After': '60' }));
      }

      // --- public auth routes ---
      if (parts[0] === 'auth') {
        // NOTE: these two MUST use `await` (unlike a bare `return handler()`,
        // which lets a rejection escape this try/catch as an uncaught
        // exception → Cloudflare Error 1101 instead of a clean error page).
        if (parts[1] === 'google' && method === 'GET' && !parts[2]) return await handleGoogleStart(request, env);
        if (parts[1] === 'google' && parts[2] === 'callback' && method === 'GET') return await handleGoogleCallback(request, env);
        if (parts[1] === 'register' && method === 'POST') return finish(await handleRegister(request, env));
        if (parts[1] === 'login' && method === 'POST') return finish(await handleLogin(request, env));
        if (parts[1] === 'logout' && method === 'POST') return finish(await handleLogout(request, env));
        if (parts[1] === 'me' && method === 'GET') {
          const user = await getSessionUser(request, env);
          if (!user) return finish(err('Not signed in.', 401));
          return finish(json({ user: publicUser(user) }));
        }
        if (parts[1] === 'change-password' && method === 'POST') {
          const user = await getSessionUser(request, env);
          if (!user) return finish(err('Not signed in.', 401));
          return finish(await handleChangePassword(request, env, user));
        }
        if (parts[1] === 'delete' && method === 'POST') {
          const user = await getSessionUser(request, env);
          if (!user) return finish(err('Not signed in.', 401));
          return finish(await handleDeleteAccount(request, env, user));
        }
        return finish(err('Not found.', 404));
      }

      // --- public ranking ---
      if (parts[0] === 'ranking' && method === 'GET') return finish(await handleRanking(request, env));

      // --- public OPDS search (no sign-in; Our Reader's search box calls this) ---
      if (parts[0] === 'opds' && parts[1] === 'search' && method === 'GET') return finish(await handleOpdsSearch(request, env));

      // --- public book comments + likes (works signed out; liked=false then) ---
      if (parts[0] === 'books' && parts[2] === 'comments' && parts.length === 3 && method === 'GET') {
        const bookId = decodeURIComponent(parts[1] || '');
        const user = await getSessionUser(request, env); // null when signed out
        return finish(await handleGetComments(env, bookId, user));
      }

      // --- everything below needs a signed-in user ---
      const user = await getSessionUser(request, env);
      if (!user) return finish(err('Please sign in first.', 401));

      if (parts[0] === 'books') {
        const bookId = decodeURIComponent(parts[1] || '');
        if (parts[2] === 'comments' && parts.length === 3 && method === 'POST') return finish(await handlePostComment(request, env, user, bookId));
        if (parts[2] === 'comments' && parts.length === 4 && method === 'DELETE') return finish(await handleDeleteComment(env, user, bookId, parts[3]));
        if (parts[2] === 'like' && parts.length === 3 && method === 'POST') return finish(await handleToggleLike(env, user, bookId));
        return finish(err('Not found.', 404));
      }
      if (parts[0] === 'shelves') {
        if (parts.length === 1 && method === 'GET') return finish(await handleListShelves(env, user));
        if (parts.length === 1 && method === 'POST') return finish(await handleCreateShelf(request, env, user));
        if (parts.length === 2 && method === 'DELETE') return finish(await handleDeleteShelf(env, user, parts[1]));
        if (parts.length === 3 && parts[2] === 'books' && method === 'POST') return finish(await handleAddShelfBook(request, env, user, parts[1]));
        if (parts.length === 4 && parts[2] === 'books' && method === 'DELETE') return finish(await handleRemoveShelfBook(env, user, parts[1], decodeURIComponent(parts[3])));
        return finish(err('Not found.', 404));
      }
      if (parts[0] === 'progress') {
        if (method === 'POST') return finish(await handleProgress(request, env, user));
        if (method === 'GET') return finish(await handleGetProgress(request, env, user));
        return finish(err('Not found.', 404));
      }
      if (parts[0] === 'history' && method === 'GET') return finish(await handleHistory(request, env, user));
      if (parts[0] === 'stats' && method === 'GET') return finish(await handleStats(env, user));
      if (parts[0] === 'fix') {
        if (method === 'POST') return finish(await handleFixReport(request, env, user));
        if (parts[1] === 'mine' && method === 'GET') return finish(await handleMyFixReports(env, user));
        return finish(err('Not found.', 404));
      }
      if (parts[0] === 'support' && method === 'POST') return finish(await handleSupport(request, env, user));

      return finish(err('Not found.', 404));
    } catch (e) {
      console.error(e);
      return finish(err('Something went wrong. Please try again.', 500));
    }
  },
};
