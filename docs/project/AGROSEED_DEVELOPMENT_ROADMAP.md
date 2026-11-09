# AgroSeed Development Roadmap

This roadmap turns [the e-commerce build plan](AGROSEED_BUILD_PLAN.md) into ordered delivery work for a client project. Each piece has a defined outcome and acceptance condition. The target is a production-ready, bilingual ecommerce store with separate customer pages and a protected staff admin area. The current sandbox is a starting reference; demo flows are not a substitute for the contracted customer and staff workflows.

## Where the project is now

The November 2026 one-go build added a new responsive customer app in `public/app.html`, `public/app.js`, and `public/app.css`. The Node server sends the roadmap customer and admin URLs to that shared app. An English/Hindi preference persists and switches key interface labels and catalog names; full Hindi page/content review remains. Public routes use the local sample API for browsing, search, product variants, cart, quote, preview order, and secure-token tracking. Account routes use server-backed customer APIs when production database and OTP credentials are configured.

The local admin console at `/admin` supports one environment-configured owner login, product and variant edits, publish states, local image upload, CSV import, stock adjustments, sandbox order management, basic categories/brands, coupons, service PIN settings, local support inbox, reports, and audit events. The API stores preview state in `storage/sandbox-store.json`; uploaded images stay under `storage/uploads/`. These are local preview services, not durable hosted operations.

The actual business catalog is still not approved. The sample rows in `backend/seed/products.json` and existing prototype catalog drafts are placeholders. Checkout does not accept payment, promise delivery, send notifications, or create production orders. The demo APIs are disabled under `NODE_ENV=production` or when `AGROSEED_DEMO_MODE=false`.

The build-plan direction remains Next.js/TypeScript, Node API, PostgreSQL/Prisma and external image storage. This delivery kept the existing Node/HTML app as a fast, GoDaddy-compatible local preview and added a MySQL-backed customer-account slice. Record and approve that trade-off before treating the scaffold as the contracted production architecture. See [the one-go delivery report](../AGROSEED_ONE_GO_DELIVERY.md) for completed preview work and remaining client/service dependencies.

The latest preview increment adds guest-cart API persistence keyed by a random token, explicit per-SKU available/reserved inventory, product image ordering and alt text, a customer image gallery, and product-page PIN serviceability checks. The checklist now records 38 tasks complete at preview level, 15 in progress, and 20 waiting on client inputs/services. Local JSON and media remain unsuitable as production storage.

## How products and admin work in a real store

For the first release, AgroSeed's owner controls one retailer catalog and decides which products are listed. Suppliers or brands may provide product information, but they do not have seller accounts or control listings. A marketplace with outside sellers would need seller accounts, commissions, seller payouts, and separate fulfillment controls, so it is outside the first release.

1. AgroSeed obtains product facts and media from its approved suppliers/brands and checks the details it is allowed to publish: product name, brand, category, SKU, pack size, price, stock, images, label information, and usage directions.
2. An authorized staff member adds or imports the product using the AgroSeed admin dashboard. Staff can create one product at a time or upload a checked CSV for a batch. A supplier feed/API can be connected later if the supplier supports one.
3. Product records, prices, variants, and stock are stored in the store database. Product photos live in image/object storage; the database stores their URLs and metadata. The database, not an HTML file, is the catalog source of truth.
4. New or changed products can stay in `Draft` until reviewed. Publishing changes their status to `Published`; only published products are eligible to appear in the public shop. Staff can unpublish or archive them without deleting past order records.
5. The storefront asks the AgroSeed API for published products. The API returns the data for home-page highlights, search results, categories, brands, and product detail pages. Inventory is tracked against each sellable pack/variant.
6. At purchase time the server checks the current price and available stock. An order saves a snapshot of the item name, SKU, pack, and price so later catalog edits do not rewrite order history.

The store admin will be a protected area on the AgroSeed site, for example `/admin`. Store staff use it to manage products and orders. GoDaddy's hosting control panel is separate: it manages the app deployment, domain, and environment settings; it is not where staff should add products. Only trusted staff roles should have access to `/admin`, and important price, stock, refund, and order actions should be logged.

## Client delivery standard

- Agree the customer journeys, admin roles, initial product count, language/content responsibilities, delivery area, payment/COD rules, support ownership, and integrations with the client before implementation is considered complete.
- Keep local development, client review/staging, and production separated. Staging is a normal review and release environment; production must never use demo product/order data or demo authentication.
- Build product entry and ongoing operations as real admin workflows. Do not require the client to edit HTML, JavaScript, JSON files, or database rows to maintain the catalog.
- Record acceptance criteria per page and workflow. Review the complete customer path and the staff product/order paths in staging before production release.
- Handoff should include the deployed application, client-owned admin access, deployment/environment notes, a product import template, backup and restore instructions, and a short staff guide for catalog and order operations.

## Page map

### Customer-facing pages

| Page | Suggested route | Main job |
|---|---|---|
| Home | `/` | Explain AgroSeed, show categories, seasonal highlights, and published products |
| All products | `/shop` | Search, sort, and filter the full catalog |
| Category | `/category/:slug` | Browse one category and its subcategories |
| Brand | `/brand/:slug` | Browse products from one brand |
| Search results | `/search?q=...` | Show matching products with useful filters |
| Product details | `/product/:slug` | Photos, description, pack choices, price, stock, delivery check, usage and add-to-cart |
| Cart | `/cart` | Review items, quantities, and estimated totals |
| Checkout | `/checkout` | Address, delivery, final server-calculated total, and payment/COD choice |
| Order confirmation | `/order/:orderNumber` | Confirm the order and explain next steps |
| Track order | `/track-order` | Securely look up current fulfillment status |
| Sign-in / OTP | `/account/login` | Verify a customer's phone number |
| Account | `/account` | Customer profile and shortcuts |
| My orders | `/account/orders` | Order history and order detail links |
| Addresses | `/account/addresses` | Saved delivery addresses |
| Help and contact | `/help`, `/contact` | FAQs and real support channels |
| Policies | `/shipping-returns`, `/privacy`, `/terms` | Publish clear store policies and business details |
| Guides (optional first release) | `/guides`, `/guides/:slug` | Publish useful farming content separately from the store catalog |

### Staff admin pages

| Page | Suggested route | Main job |
|---|---|---|
| Admin sign-in | `/admin/login` | Staff-only authentication |
| Overview | `/admin` | Today's orders, low stock, and operational alerts |
| Product list | `/admin/products` | Search, filter, publish, unpublish, and archive products |
| Add/edit product | `/admin/products/new`, `/admin/products/:id` | Maintain product details, images, categories, brands, and pack variants |
| Bulk import | `/admin/products/import` | Validate CSV rows and show errors before importing |
| Inventory | `/admin/inventory` | Adjust stock by variant with a reason and audit record |
| Orders | `/admin/orders`, `/admin/orders/:orderNumber` | Review, pack, ship, cancel, and record returns/refunds |
| Categories and brands | `/admin/catalog` | Maintain the browse structure and brand pages |
| Offers | `/admin/promotions` | Manage coupons and featured/sponsored placement |
| Delivery setup | `/admin/shipping` | Manage serviceable PIN codes and delivery rules |
| Reports | `/admin/reports` | Basic order and sales summaries |
| Staff and settings | `/admin/settings` | Manage staff roles and store configuration (owner access) |

## Build order

Each part should have a visible result and a clear completion check. The order follows the dependencies: first decide the store rules, then make the data and pages, then take real orders, then add operating tools and launch controls.

### Part 1 — Confirm the first-release scope

- Choose the initial service area/PIN codes, who packs and ships orders, delivery provider or manual process, and whether COD is offered.
- Gather the first approved catalog: product names, SKUs, variants/packs, prices, stock, images, and accurate product/label details.
- Confirm the business contact and policy information needed on customer pages.
- Keep the first release as a single AgroSeed retailer unless a seller marketplace is explicitly needed.

**Done when:** there is a usable first catalog and a documented rule for how each order will be fulfilled.

### Part 2 — Establish the multi-page app foundation

- Create the production app structure based on the agreed Next.js/TypeScript direction, while preserving the current design as a visual reference.
- Define route handling, Hindi/English behavior, shared header/footer, page layouts, form/button styles, and responsive rules.
- Create separate `StoreLayout`, `AccountLayout`, and `AdminLayout` shells so customer and staff navigation stay distinct.
- Add empty route pages from the page map. Make links navigate between pages rather than only jumping to sections or opening demo panels.
- Set up local, preview/staging, and production environment configuration without putting secrets in Git.

**Done when:** every agreed route renders the correct shell and can be opened directly by URL.

### Part 3 — Create the data foundation

- Set up PostgreSQL and Prisma migrations for products, variants, inventory, categories, brands, customers, addresses, carts, orders, payments, coupons, and audit logs.
- Define product and variant fields; use integer paise for money and store SKU per sellable variant.
- Add image storage configuration and store image metadata/URLs in the catalog.
- Import a small, reviewed set of sample products. Stop using separate browser arrays as the long-term catalog source.
- Document how staging data is kept separate from production data.

**Done when:** the same catalog records can be read from the database through the API in local/staging environments.

### Part 4 — Build secure staff access and catalog management

- Add staff authentication, roles (start with owner/admin and catalog/order staff), session protection, and sign-out.
- Build the product list and add/edit product pages, including bilingual text, category/brand, SKU, images, price, pack variants, status, and product details.
- Add draft, review, publish, unpublish, and archive states.
- Add inventory adjustments with a required reason and an audit history.
- Add CSV import with a downloadable template, preview, field validation, duplicate SKU detection, row-level errors, and an explicit create/update confirmation so an import cannot silently overwrite live products.
- Support secure image upload and image ordering. If the agreed catalog size makes bulk media practical, accept a ZIP whose image filenames map to product SKUs and report unmatched files before import.
- Log who created, edited, published, unpublished, or archived each product and when.

**Done when:** an authorized staff member can create and publish a product, and a non-staff visitor cannot access admin routes or admin APIs.

### Part 5 — Build storefront navigation and catalog pages

- Build the shared public header, search, language control, category navigation, footer, and mobile menu.
- Build the home page with category links and product collections that come from published catalog data.
- Build `/shop`, category pages, brand pages, and search results with sorting, filters, pagination, loading, empty, and error states.
- Add the public catalog API and use it for all product cards; show published products, including out-of-stock products with an unavailable state, and prevent unavailable variants from being purchased.
- Keep product placement (featured/sponsored) as an explicit admin-managed setting, not a hardcoded flag in page code.

**Done when:** staff publishing/unpublishing a product changes whether it appears in the public catalog without editing frontend code; stock changes update purchasability without corrupting the listing.

### Part 6 — Build product details and variant stock

- Build the product detail page with gallery, bilingual copy, SKU/brand/category, pack selection, price, availability, and quantity.
- Add clear product information and any appropriate handling/usage details based on approved source material.
- Check stock per variant and prevent adding unavailable or invalid quantities.
- Add a delivery PIN check using the configured serviceability data.

**Done when:** a customer can open a direct product URL, choose a valid pack, and see current server-provided price/availability.

### Part 7 — Build the cart

- Create a cart page with item/pack details, quantity edits, remove action, subtotal, and coupon entry.
- Support a guest cart first; associate it with a customer after login if/when they sign in.
- Treat browser prices as display only. Recalculate prices, discounts, shipping, and totals on the server.
- Recheck variant availability when the cart changes and again before order creation.

**Done when:** cart content persists across navigation and invalid prices or quantities cannot be submitted as trusted totals.

### Part 8 — Build address, delivery, and checkout

- Collect and validate recipient phone, address, state, and PIN code.
- Confirm that the PIN code is serviceable and show delivery fee/estimate according to store rules.
- Add guest checkout; require verified phone where needed for delivery updates.
- Create a server-validated checkout quote and expire/recheck it before order placement.

**Done when:** a customer can reach a correct final order summary for a valid address and the site blocks unsupported delivery areas.

### Part 9 — Create orders and connect payments

- Create orders transactionally, reserve stock, and save an immutable order-item/address snapshot.
- Build confirmation and secure order tracking pages.
- Connect the payment provider in sandbox first; verify signed webhooks on the server and handle duplicate events safely.
- Add COD only if the fulfillment policy is confirmed. Record payment state separately from fulfillment state.
- Define cancellation, failed payment, stock release, refund, and return transitions.

**Done when:** a sandbox order can move through placed, paid or COD-pending, packed, shipped, delivered, and eligible cancellation/refund states with a reliable history.

### Part 10 — Build order and delivery operations in admin

- Add order queue filters and detail view for customer contact, address, purchased item snapshots, and payment status.
- Add fulfillment actions: confirm, pack, ship, tracking number, delivered, cancel, return, and refund record.
- Add order notifications using configured email/SMS services, with safe staging adapters.
- Keep every staff status change in the audit log.

**Done when:** staff can fulfill and update a sandbox order end-to-end without directly editing database files.

### Part 11 — Add customer accounts and support pages

- Connect OTP login with expiry, retry limits, rate limits, and secure sessions.
- Build profile, order history, saved addresses, and customer order details.
- Add help/contact forms and wire them to a monitored support destination.
- Add shipping/returns, privacy, terms, seller/contact details, and customer-facing FAQs.
- Add guides/newsletter only after the store purchase flow is stable.

**Done when:** customers can securely access their own information and can find a working way to get help.

### Part 12 — Complete store controls, client acceptance, and go live

- Add coupons, featured collections, serviceable PIN codes, shipping rules, staff roles, and basic sales/low-stock reporting in admin.
- Verify access control, input validation, request limits, payment webhook signatures, backups, and recovery steps against the agreed release requirements.
- Review mobile layouts, bilingual content, keyboard use, page speed, error states, and direct URLs with the client in staging.
- Complete client acceptance of the full customer purchase path and staff catalog/order workflows on GoDaddy Preview with a separate staging database and payment test credentials.
- Set production secrets and database only after acceptance; import the client-approved production catalog, take a backup, publish, and hand over the admin guide and operating notes.

**Done when:** the client has accepted the production site, approved catalog, fulfillment rules, support and policy pages, purchase and operations paths, admin access, and documented backup, restore, and release procedures.

## Practical first task

Start with **Part 1: Confirm the client scope and acceptance criteria**. Then build the multi-page foundation, production data model, secure admin, and catalog upload workflow before connecting the public shop to the live catalog. This gives the client a maintainable product-management process and gives each release stage a clear acceptance point.
