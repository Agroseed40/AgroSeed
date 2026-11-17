CREATE TABLE IF NOT EXISTS agroseed_customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agroseed_customers_email ON agroseed_customers(email);

CREATE TABLE IF NOT EXISTS agroseed_customer_carts (
  customer_id TEXT PRIMARY KEY,
  items_json TEXT NOT NULL,
  guest_snapshot_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES agroseed_customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agroseed_customer_addresses (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL CHECK (length(pincode) = 6),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES agroseed_customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agroseed_customer_addresses_owner ON agroseed_customer_addresses(customer_id, is_default, created_at);
