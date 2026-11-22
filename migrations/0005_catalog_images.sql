CREATE TABLE IF NOT EXISTS agroseed_catalog_images (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  content BLOB NOT NULL
);
