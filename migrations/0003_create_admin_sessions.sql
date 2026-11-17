CREATE TABLE IF NOT EXISTS agroseed_admin_sessions (
  token_hash TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agroseed_admin_sessions_expiry ON agroseed_admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS agroseed_admin_login_attempts (
  ip_hash TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_started INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
