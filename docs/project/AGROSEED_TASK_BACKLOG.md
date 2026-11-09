# AgroSeed Client Delivery Task Backlog

This is the task-by-task execution list derived from `AGROSEED_BUILD_PLAN.md` and `AGROSEED_DEVELOPMENT_ROADMAP.md`. Work in order, one task at a time. Each task should result in a reviewable change and satisfy its completion condition before the next dependent task starts.

The **Page map** and architecture in `AGROSEED_DEVELOPMENT_ROADMAP.md` are authoritative. The tasks below implement that schema; adding or changing a route requires an agreed scope update first.

**Status key:** `[ ]` Not started · `[x]` Complete · `[~]` In progress · `[!]` Waiting for a client decision/input

**One-go build update (9 November 2026):** the local preview now has a multi-page customer flow and a protected, local-only staff console. Current checklist: **44 complete, 8 in progress, 21 waiting on client inputs/services, 0 not started.** Blank, editable admin fields are available for store copy, support details, and policy/rule text; customer pages show a clear not-configured notice until approved wording is entered. “Complete” means the preview behavior is implemented; tasks marked `[~]` are being actively worked, while `[!]` tasks await client input or external services described in [the delivery and remaining work note](../AGROSEED_ONE_GO_DELIVERY.md).

## Phase 0 — Agree the client deliverable

- [x] **AS-001 — Confirm first-release scope.** List required customer pages, admin functions, and features explicitly outside this delivery. **Complete when:** the agreed first-release baseline is written down. The scope below is set from the existing build plan and the project direction in chat; client-specific operating details are handled in later tasks.
- [x] **AS-002 — Confirm the store operating model.** AgroSeed is an owner-managed retailer: the owner decides which products are listed. Suppliers/brands may provide product information, but there are no third-party seller accounts or seller-controlled listings in the first release.
- [!] **AS-003 — Confirm business and fulfillment rules.** Deferred for later editing; use the clearly marked dummy lines in `docs/archive/CLIENT_OPERATIONS_PLACEHOLDERS.md` for now. Replace them with approved service PIN codes, shipping method/rates, packing owner, COD policy, cancellation/return rules, and support contact before checkout/policy content is published.
- [!] **AS-004 — Confirm catalog and content inputs.** The current 65-item prototype catalog draft is at `docs/archive/CATALOG_DRAFT_FROM_SITE_DATA.md`; the intake template is at `docs/archive/CLIENT_CATALOG_INTAKE_DRAFT.md`. The owner must approve or replace the demo items and supply pack/SKU/price/stock data, images, and bilingual copy. Do not treat the prototype or sandbox seed data as the real catalog. **Complete when:** the client supplies a usable approved catalog and identifies any missing fields.
- [!] **AS-005 — Confirm integrations and ownership.** Decide payment, SMS/OTP, email, image storage, database, domain/hosting, and who owns each account. **Complete when:** providers, account owners, and required credentials are documented (credentials remain in secrets storage).
- [!] **AS-006 — Approve page map and acceptance list.** Review customer/admin routes and the end-to-end flows in the roadmap. **Complete when:** client agrees what must work for acceptance.

### AS-001 proposed first-release scope

This is the first-release scope baseline based on the existing build plan, the roadmap page map, and the project direction given in chat.

**Included**

- A bilingual Hindi/English customer website with separate routes for home, shop, categories, brands, search, product details, cart, checkout, order confirmation and tracking, customer sign-in/account/orders/addresses, help/contact, and policy pages.
- A single AgroSeed retailer catalog, with product selection and publication controlled by the owner and staff. Suppliers/brands may provide product information, but outside sellers do not manage listings.
- A protected staff admin with role permissions and audit history.
- Product management for bilingual content, categories/brands, photos, products and pack variants, pricing, stock, draft/review/publish states, and archive/unpublish actions.
- Product image upload and validated CSV bulk import with preview and row-level results.
- Customer checkout with delivery-area lookup and server-side price/stock calculation, order records, configured payment and optional COD, order tracking, and staff fulfillment actions.
- Admin controls for inventory, orders, categories/brands, promotions, shipping/service areas, staff/settings, and basic operational reports.
- Architecture direction from the build plan: Next.js/TypeScript, Node API, PostgreSQL/Prisma, image storage, and GoDaddy hosting by default.

**Not included in the first release unless added to client scope**

- Outside-seller marketplace, seller accounts, commissions, or seller payouts.
- Supplier/ERP feeds, multi-warehouse operations, or courier aggregator automation.
- Native mobile apps, loyalty/rewards, product reviews, and advanced recommendation systems.
- Guides and newsletter, which the roadmap already marks optional.

**Client-provided details needed for implementation and production acceptance**

- Approved product catalog, product media, and Hindi/English product content.
- Launch PIN codes, delivery rates/estimates, fulfillment process, returns/cancellations, and COD rules.
- Payment and OTP/SMS/email providers and client-owned service accounts.
- Support contact, business identity, and approved policy text.

## Phase 1 — Create the multi-page application foundation

- [x] **AS-007 — Record the architecture decision.** Final build follows the existing plan: GoDaddy Node.js Hosting as the default host; Next.js/TypeScript web app, Node API, PostgreSQL/Prisma, and managed image storage/CDN. The current dependency-free Node/HTML app remains the local preview, not the final production stack. **Complete when:** the chosen stack and deployment shape are documented.
- [x] **AS-008 — Create the web app scaffold.** The GoDaddy-compatible Node app serves the multi-route frontend and has documented local run instructions. A Next.js/TypeScript migration is a separate architecture decision.
- [x] **AS-009 — Add environment configuration.** Validate NODE_ENV, PORT, and boolean feature settings at startup; invalid values fail with a clear error. `.env.example` contains safe blank placeholders and no credentials.
- [x] **AS-010 — Set up the shared visual system.** Extract colors, typography, spacing, buttons, fields, alerts, and breakpoints from the current visual reference. **Complete when:** shared components can use the same tokens across routes.
- [x] **AS-011 — Build the public site shell.** Add the shared header, search slot, language control, footer, and mobile navigation. **Complete when:** the shell works on desktop/mobile and does not depend on one-page anchors.
- [x] **AS-012 — Build the account shell.** Add account navigation and a responsive layout for sign-in, addresses, and orders. **Complete when:** account routes share one layout.
- [x] **AS-013 — Build the separate admin shell.** Add admin navigation, staff identity area, and sign-out control. **Complete when:** admin routes have an unmistakable staff layout and do not appear in public navigation.
- [x] **AS-014 — Create route placeholders.** Add the agreed customer and admin URLs with page titles and correct layout assignment. **Complete when:** every agreed route opens directly and has a not-found state.
- [x] **AS-015 — Establish language and URL behavior.** Hindi/English share route URLs; the selected language persists in browser storage and is applied across customer routes. Approved complete Hindi copy still needs review.

## Phase 2 — Build the production data foundation

- [!] **AS-016 — Connect PostgreSQL safely.** Add the database client and separate local, staging, and production connection configuration. **Complete when:** each environment can be configured independently.
- [!] **AS-017 — Define catalog models.** Add category, brand, product, product variant/SKU, product image, and publication status models. **Complete when:** product packs can have separate SKUs/prices and content supports both languages.
- [x] **AS-018 — Define inventory models.** The preview tracks available and reserved units per SKU plus timestamped inventory transactions for adjustments, reservations, releases and shipment fulfillment. Production database models remain under AS-016 to AS-020.
- [!] **AS-019 — Define commerce models.** Add customer, address, cart, order, order item, payment, shipment, coupon, and audit log models. **Complete when:** order items can preserve the purchased name, SKU, pack, and price snapshot.
- [!] **AS-020 — Create migrations and seed data.** Add reviewed non-customer sample data and repeatable migrations. **Complete when:** a clean staging database can be created from documented steps.
- [!] **AS-021 — Set up product image storage.** Add private upload authorization, image validation, persistent storage, and CDN/public delivery URLs. **Complete when:** an authorized admin can store an image and the catalog can refer to it without storing image files in the application bundle.
- [x] **AS-022 — Add API validation and error format.** The preview API uses JSON client-safe errors, validates catalog/checkout/admin inputs, and supports paginated catalog, product, and order lists.

## Phase 3 — Secure staff access and product administration

- [x] **AS-023 — Implement staff sign-in and sessions.** The local owner console requires an environment password, uses an expiring HTTP-only SameSite cookie with CSRF checks and login throttling, supports sign-out, and can be recovered by resetting the local environment password.
- [x] **AS-024 — Add staff roles and access checks.** The API applies server-side access rules for Owner/Admin, Catalog, and Orders roles; the admin navigation is role-aware. Unknown roles and unclassified routes fail closed. The current local login issues only an Owner session; persistent staff accounts and role assignment are AS-068.
- [x] **AS-025 — Build the admin overview.** The protected local overview shows product, published, open-order, low-stock and recent-order values with links to work queues. Production database backing is tracked separately.
- [x] **AS-026 — Build the product list page.** The local admin product list has search, status filtering, SKU display, pagination, and edit/publish/archive actions.
- [x] **AS-027 — Build product create/edit form.** Add bilingual names/descriptions, SKU, category, brand, status, and approved product detail fields. **Complete when:** saved edits persist and show validation errors beside the relevant fields.
- [x] **AS-028 — Add product image management.** Staff can upload multiple local images, edit alt text, reorder/remove images, and preview the product gallery. Image metadata and primary-image order persist with the product; durable cloud storage is tracked under AS-021.
- [x] **AS-029 — Add product variants and pricing.** Add pack/unit, SKU, price, MRP, weight, and sale status per variant. **Complete when:** each sellable pack is independently addressable and priced in integer paise.
- [x] **AS-030 — Add draft/review/publish workflow.** Allow authorized review and publishing; support unpublishing and archiving without removing order history. **Complete when:** only published catalog records are public.
- [x] **AS-031 — Add inventory adjustments.** Provide stock adjustment forms with reason, per-variant quantity, and transaction history. **Complete when:** current stock and adjustment history agree.
- [x] **AS-032 — Create CSV template and preview.** The local admin provides a downloadable template and preview validation for required bilingual fields, SKU format/duplicates, pack, paise prices, stock, and status before applying rows.
- [x] **AS-033 — Apply catalog imports safely.** Support explicit create/update behavior, confirm step, import results, and error report; prevent silent overwrite. **Complete when:** valid rows import as designed and invalid rows are clearly reported.
- [!] **AS-034 — Add bulk image mapping if needed.** Based on agreed catalog size, support ZIP upload with SKU-based filenames and unmatched-image report. **Complete when:** media mapping is previewed before applying an import.
- [x] **AS-035 — Add admin audit history.** The local preview records product, inventory, order, promotion and settings changes for its single owner identity. Durable records and role-change audit require the production identity/database layer.

## Phase 4 — Build the customer-facing catalog pages

- [x] **AS-036 — Connect the public catalog API.** Expose published product/category/brand data with search, filters, and pagination. **Complete when:** unpublished products never leak through public API routes.
- [x] **AS-037 — Build the home page.** Applied the client's farmer-first, high-choice direction: plain product-finding copy, category shortcuts, prominent active-coupon deals, special-price products, and a denser catalog grid with 24 results per page. The layout supports hundreds of approved listings through the existing pagination and import flow; demo-only catalog rows and prices are not presented as approved stock.
- [x] **AS-038 — Build the shop page.** /shop uses the public catalog API with search, category/brand filters, sorting, and previous/next pagination across preview results.
- [x] **AS-039 — Build category and brand pages.** /category/:slug and /brand/:slug share the API-backed, paginated catalog UI.
- [x] **AS-040 — Build search results.** /search?q=... searches published preview product names, brands, categories, and SKUs with paginated results.
- [x] **AS-041 — Build product detail page.** `/product/:slug` shows bilingual names, ordered photo gallery/alt text, pack variants, preview stock/prices, cart actions, and a PIN delivery check. Product label information, directions, and safety fields are optional per product and entered by the staff member uploading that product, so each listing carries its own applicable details.
- [x] **AS-042 — Add product placement controls.** Staff can feature/unfeature catalog products in admin, and the home page displays featured products with a label.
- [x] **AS-043 — Add SEO and sharing metadata.** Route titles and descriptions update from page content; Open Graph and Twitter sharing metadata include product images when uploaded; canonical URLs use the optional public domain in Admin > Settings and omit preview query parameters. Enter the connected public base URL when hosting is configured.

## Phase 5 — Build cart, delivery quote, and checkout

- [!] **AS-044 — Create cart API and persistence.** Guest carts use a random browser ID and local preview persistence; signed-in customer carts are stored in MySQL and merge guest quantities idempotently at sign-in. The code and migration are ready; defer database migration and real OTP/cart verification until MySQL storage is configured and Cognito SMS OTP is enabled.
- [x] **AS-045 — Build cart page.** Guest and signed-in carts display pack details, quantity edits/removal, preview coupons, and server-repriced checkout; cart changes sync to the account when signed in.
- [x] **AS-046 — Add serviceability lookup.** Staff can configure preview PIN codes, fees and estimates; quotes block unsupported PINs once areas are configured. No approved launch areas are assumed.
- [x] **AS-047 — Add address entry and validation.** Checkout validates recipient, Indian mobile and PIN fields server-side. A browser-local address book supports create/edit/delete/default and checkout reuse; verified account ownership is tracked under AS-058 to AS-059.
- [!] **AS-048 — Implement server-side checkout quote.** Preview quotes recheck catalog price, stock, coupons and configured delivery fee on the server; the cart and checkout clearly state that tax is excluded. Wait for approved tax rules and a production catalog/price source before calculating or charging tax.
- [x] **AS-049 — Create order and reserve stock atomically.** The single-process preview serializes order mutations, recalculates stock/discounts, reserves stock and writes order snapshots together. Production still needs a database transaction.
- [x] **AS-050 — Build order confirmation and secure tracking.** Show confirmation and lookup using authenticated ownership or a secure token. **Complete when:** customers cannot retrieve another customer's order by guessing its number.

## Phase 6 — Payments and store operations

- [!] **AS-051 — Add payment provider sandbox flow.** Create provider payment requests from server-created orders. **Complete when:** test payments can be initiated without exposing secret keys.
- [!] **AS-052 — Verify and process payment webhooks.** Verify signatures and make event processing idempotent. **Complete when:** forged/duplicate events cannot mark an order paid twice.
- [!] **AS-053 — Add COD policy and payment states.** Enable COD only for configured regions/orders and track collection separately from fulfillment. **Complete when:** policy rules are reflected at checkout and in admin.
- [x] **AS-054 — Build admin order queue and detail.** The local staff console shows order snapshots, contact/address details, status filters, search, pagination, detail history and lifecycle actions. A persistent production queue requires the production database.
- [x] **AS-055 — Add fulfillment transitions.** The sandbox records valid packing, shipment/tracking, delivery, cancellation, return and refund transitions with audit events and visible status history.
- [~] **AS-056 — Release stock on allowed failures/cancellations.** Sandbox pending orders expire after 24 hours and release stock; cancellation also returns stock. Payment-failure release awaits a payment provider.
- [!] **AS-057 — Add customer notifications.** Send configured order updates via the approved email/SMS provider. **Complete when:** staging uses test/safe destinations and production uses client-owned credentials.

## Phase 7 — Customer accounts, support, and store content

- [~] **AS-058 — Implement phone OTP.** Cognito `USER_AUTH` SMS OTP, new-user confirmation, ID-token verification, refreshable HttpOnly cookies, same-origin/CSRF checks are implemented. **Remaining:** configure Cognito phone sign-in, SMS delivery, user-pool/app-client IDs and verify real SMS on the deployed Amplify app. MySQL migration is required only for saved account data.
- [~] **AS-059 — Build account profile and addresses.** Verified customers can edit profile and save/edit/delete/default addresses in MySQL with per-customer ownership checks. **Remaining:** configure production database and run the migration; connect addresses to the live checkout flow.
- [~] **AS-060 — Build account order history.** Local account order history lists this device's private-token orders. Cross-device history and verified customer ownership remain.
- [~] **AS-061 — Build help and contact pages.** Help/contact pages and editable admin fields for approved support details are implemented; contact requests enter the local preview inbox. **Complete when:** messages reach the client's monitored support destination.
- [!] **AS-062 — Publish required policy pages.** Shipping/returns, privacy, terms, business/contact content have blank editable admin fields and customer pages show a not-configured notice until populated. **Complete when:** client-approved content is entered and policy pages are approved for publication.
- [!] **AS-063 — Add guides/newsletter if in scope.** Implement content management and signup only if the client approved these features. **Complete when:** content can be updated without editing page templates.

## Phase 8 — Admin settings, acceptance, and handoff

- [x] **AS-064 — Build category/brand administration.** The local admin can add, edit, order, and disable categories and brands; label changes update product taxonomy.
- [x] **AS-065 — Build coupons and promotions.** The local admin manages coupon expiry, minimum subtotal, usage caps, active state, and featured placements. The server checks coupons during quote and order creation.
- [~] **AS-066 — Build shipping/service-area settings.** Admin PIN-area setup controls preview fees and estimates; editable blank fields are available for delivery/COD/cancellation rules. Checkout uses configured areas. Approved launch regions/rates and COD eligibility remain.
- [x] **AS-067 — Build operational reports.** The local admin reports order count/value, low-stock variants, and product sales with explicit date filters and preview-only labels.
- [~] **AS-068 — Build admin staff and settings pages.** Add owner-controlled staff invitation/disable, role assignment, and approved store settings under the roadmap's admin routes. **Complete when:** the pages enforce server-side permissions and sensitive changes appear in the audit history.
- [~] **AS-069 — Review security and recovery readiness.** Review admin access, API authorization, secret handling, backups, restore steps, logs, and error handling. **Complete when:** findings are resolved or explicitly accepted before launch.
- [x] **AS-070 — Review responsive and bilingual experience.** Reviewed the home, catalog, and product flows at 375 px, 768 px and 1366 px, in English and Hindi. Fixed untranslated homepage copy, catalog descriptions, footer labels, product counts and pack/stock labels. Cards reflow into one/two/multiple columns with no horizontal overflow in the inspected phone and tablet views.
- [!] **AS-071 — Run client acceptance in staging.** Walk catalog upload, publish/unpublish, customer purchase, payment/COD, shipment update, and support flows using test data. **Complete when:** acceptance items are signed off and no staging data uses production customers/payments.
- [!] **AS-072 — Prepare production cutover.** Configure client-owned production accounts/secrets, database, domain, image storage, payment/SMS settings, and approved catalog import. **Complete when:** production configuration is reviewed and backed up before publish.
- [!] **AS-073 — Publish and hand over.** Release the site, give client staff admin access/training, deliver import template, operating guide, deployment notes, and backup/restore procedure. **Complete when:** client can independently manage products and orders and knows how to get operational support.

## Remaining client inputs

The next items requiring AgroSeed's input are **AS-003–006**: launch delivery/returns/COD rules, approved catalog and product content, integration/account ownership, and staging acceptance scope. Production architecture, database, hosting, and provider setup also need the relevant owner decisions before live deployment.

