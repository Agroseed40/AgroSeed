-- Start empty on new databases and preserve existing merchant-managed records.
INSERT OR IGNORE INTO agroseed_app_state (state_id, payload) VALUES (1, '{}');

CREATE TABLE agroseed_guest_carts (
  id TEXT PRIMARY KEY,
  items TEXT NOT NULL CHECK (json_valid(items)),
  updated_at TEXT NOT NULL
);
CREATE INDEX agroseed_guest_carts_updated ON agroseed_guest_carts(updated_at);

INSERT INTO agroseed_guest_carts (id, items, updated_at)
SELECT key, value -> '$.items', replace(rtrim(value ->> '$.updatedAt', 'Z'), 'T', ' ')
FROM agroseed_app_state, json_each(payload, '$.carts')
WHERE state_id = 1 AND json_type(value, '$.items') = 'array'
  AND datetime(value ->> '$.updatedAt') > datetime('now', '-30 days');

-- Keep the original preview order records private for recovery. Release only
-- units still reserved for those preview orders before removing the workflows.
UPDATE agroseed_app_state
SET payload = json_remove(json_set(payload, '$.products', json(COALESCE((
  SELECT json_group_array(json(product))
  FROM (
    SELECT CASE WHEN json_type(p.value, '$.variants') = 'array' THEN
      json_set(p.value, '$.variants', json((
        SELECT json_group_array(json(CASE WHEN held > 0 THEN
          json_set(variant, '$.stock', (variant ->> '$.stock') + held,
            '$.reserved', (variant ->> '$.reserved') - held)
          ELSE variant END))
        FROM (
          SELECT v.value AS variant,
            min(coalesce(v.value ->> '$.reserved', 0), coalesce((
              SELECT sum(CAST(line.value ->> '$.quantity' AS INTEGER))
              FROM json_each(payload, '$.orders') AS o, json_each(o.value, '$.items') AS line
              WHERE o.value ->> '$.previewOnly' = 1
                AND o.value ->> '$.status' IN ('sandbox_pending', 'confirmed', 'packing')
                AND line.value ->> '$.sku' = v.value ->> '$.sku'
            ), 0)) AS held
          FROM json_each(p.value, '$.variants') AS v
        )
      )))
      ELSE p.value END AS product
    FROM json_each(payload, '$.products') AS p
    WHERE (p.value ->> '$.sku', p.value ->> '$.nameEn') NOT IN (
      ('SB-SEED-0001', 'Arka Rakshak Tomato Seeds'),
      ('SB-NUTR-0002', 'Neem and Seaweed Soil Tonic'),
      ('SB-PEST-0003', 'Yellow Sticky Pest Cards · Pack of 10'),
      ('SB-TOOL-0004', 'Garden Pruning Shears'),
      ('SB-SEED-0005', 'Monsoon Okra Seeds')
    )
  )
), '[]'))), '$.carts'),
revision = revision + 1, updated_at = CURRENT_TIMESTAMP
WHERE state_id = 1;
