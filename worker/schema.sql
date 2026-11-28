-- Our Boighar D1 schema — run once in the D1 console (Cloudflare dashboard → D1 → our-boighar-db → Console).
-- Safe to re-run: all statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,               -- crypto.randomUUID()
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,        -- lowercased
  password_hash TEXT,                -- salt$hash (PBKDF2-SHA256); NULL for Google-only users
  google_id TEXT UNIQUE,             -- Google sub; NULL for email users
  avatar_url TEXT,
  created_at INTEGER NOT NULL,       -- unix ms
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,            -- 256-bit random, hex
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,            -- random, HMAC-signed in the cookie flow
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,               -- book slug, same as search.json book_id
  title TEXT NOT NULL,
  writer TEXT,
  category TEXT,
  language TEXT
);

CREATE TABLE IF NOT EXISTS shelves (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shelves_user ON shelves(user_id);

CREATE TABLE IF NOT EXISTS shelf_books (
  shelf_id TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (shelf_id, book_id)
);
CREATE INDEX IF NOT EXISTS idx_shelf_books_book ON shelf_books(book_id);

CREATE TABLE IF NOT EXISTS book_status (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id),
  status TEXT NOT NULL CHECK (status IN ('reading','want','finished')),
  percent INTEGER NOT NULL DEFAULT 0,
  cfi TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, book_id)
);
CREATE INDEX IF NOT EXISTS idx_status_user ON book_status(user_id);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT REFERENCES books(id),
  event TEXT NOT NULL,               -- started|progress|finished|rated|shelved|unshelved
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,              -- started|finished|rated|shelved|streak|fix
  points INTEGER NOT NULL,
  book_id TEXT REFERENCES books(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_points_user ON points(user_id);
-- one award per (user, reason, book) for book-scoped reasons; enforced in code with a pre-check

CREATE TABLE IF NOT EXISTS fix_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id),
  field TEXT NOT NULL,               -- title|writer|creator|category|language|cover|file|other
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fixed','rejected')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fix_user ON fix_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_fix_status ON fix_reports(status);

CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  subject TEXT,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT NOT NULL,
  scope TEXT NOT NULL,               -- 'general' | 'auth'
  window_start INTEGER NOT NULL,     -- unix ms of the window start
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (ip, scope, window_start)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id TEXT REFERENCES books(id),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  text TEXT,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_comments_book ON comments(book_id, created_at DESC);

CREATE TABLE IF NOT EXISTS likes (
  book_id TEXT REFERENCES books(id),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER,
  PRIMARY KEY (book_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_book ON likes(book_id);
