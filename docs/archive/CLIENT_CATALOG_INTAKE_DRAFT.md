# Client Catalog Intake Draft

**Status:** Working intake template with dummy content. The example below is not a real product and must not be published or imported as live catalog data.

Use one row per sellable pack/variant. Reuse the same `product_group_id` for packs that belong to one product; each pack needs its own unique SKU, price, and opening stock. Staff should import approved records as drafts, review them, then publish.

## Fields to provide

| Field | What to enter |
|---|---|
| `product_group_id` | Shared ID for one product and its pack variants |
| `sku` | Unique code for this exact sellable pack |
| `product_name_en`, `product_name_hi` | Approved product names in both languages |
| `brand_en`, `brand_hi` | Brand names in both languages |
| `category_en`, `category_hi` | Approved category in both languages |
| `subcategory_en`, `subcategory_hi` | Subcategory, if used |
| `description_en`, `description_hi` | Approved product description in both languages |
| `variant_name` | Pack label shown to the shopper, such as `500 g` or `10 seeds` |
| `pack_quantity`, `pack_unit` | Numeric amount and unit for this variant |
| `mrp_inr`, `selling_price_inr` | Approved prices in rupees; the application will convert them to paise |
| `opening_stock` | Initial sellable quantity for this SKU |
| `shipping_weight_g` | Packed weight in grams, if shipping rules require it |
| `primary_image_filename` | Filename of the main approved product image supplied separately |
| `gallery_image_filenames` | Optional additional image filenames, separated by `|` |
| `label_usage_details_en`, `label_usage_details_hi` | Approved label, storage, and usage details for both languages |
| `lot_or_regulatory_details` | Lot, expiry, or applicable product registration details, when required for the item |

## Dummy example row

| product_group_id | sku | product_name_en | product_name_hi | brand_en | brand_hi | category_en | category_hi | variant_name | mrp_inr | selling_price_inr | opening_stock | primary_image_filename |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| DUMMY-PRODUCT-001 | DUMMY-SKU-001 | DUMMY — replace with approved name | DUMMY — replace with approved Hindi name | DUMMY BRAND | DUMMY BRAND | DUMMY CATEGORY | DUMMY CATEGORY | DUMMY pack size | 0.00 | 0.00 | 0 | DUMMY-image.jpg |

## Review notes

- Do not treat the sample catalog in `backend/seed/products.json` or the browser demo arrays as client-approved product data.
- Confirm each product's source and details with the AgroSeed owner before listing it. Do not invent product claims or translate technical label text without approval.
- Supplied image files should use the referenced filenames. The final admin import tool will validate image references and duplicate SKUs before applying an import.
- If a product does not have a meaningful Hindi translation or an applicable lot/regulatory field, leave that field blank for client review instead of fabricating a value.
