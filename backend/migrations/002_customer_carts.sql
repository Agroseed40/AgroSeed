CREATE TABLE IF NOT EXISTS customer_carts (
  customer_id CHAR(36) NOT NULL PRIMARY KEY,
  items_json JSON NOT NULL,
  guest_snapshot_json JSON NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_customer_carts_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
