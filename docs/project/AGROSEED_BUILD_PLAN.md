# AgroSeed E-commerce Build Plan

## Product goal

Build AgroSeed as a bilingual (Hindi/English) online store for Indian farmers and home growers. Customers should be able to discover trusted farm inputs, check crop/pack details, confirm delivery by PIN code, place and track orders, and contact support. Staff should manage products, stock, orders, offers, and customer issues from a protected admin area.

## Current starting point

The current responsive customer app is `public/app.html`, `public/app.js`, and `public/app.css`; the retired one-page mock and standalone catalog are kept outside the deployable source under `docs/archive/retired-prototype/`. The Node app routes `/` and customer/admin pages through the shared app. Local preview mode still uses sample catalog rows, a browser cart, demo quotes/orders, and private-token tracking. The `/admin` preview provides local product, inventory, import, order, settings, promotion and support workflows behind a password from the local environment.

This is still primarily a local sandbox. Sample products are unapproved, local JSON and uploaded files are not durable hosted storage, and there is no live payment, delivery, email or order service. A real customer phone-account backend has now been added (MSG91 OTP, GoDaddy MySQL tables, customer ID/session, profile, and saved addresses), but it requires production database credentials, MSG91 credentials, and its SQL migration before it can serve customers. Demo APIs are disabled in production mode. See [the one-go delivery note](../AGROSEED_ONE_GO_DELIVERY.md) for precise scope and blockers.

## Recommended first release

1. **Storefront:** responsive Hindi/English home, category and search results, product detail pages, pack/variant choice, stock and delivery estimate, cart, checkout, order confirmation, order tracking, help/contact.
2. **Customer account:** phone OTP sign-in, saved addresses, order history, cancellation request, notification preferences. Allow guest checkout if desired, but collect a verified phone number for delivery updates.
3. **Checkout:** address and PIN-code validation, shipping fee, coupon validation, server-calculated totals, prepaid payment and cash-on-delivery where enabled.
4. **Operations:** admin sign-in with roles; manage products, variants, prices, stock, images, PIN-code serviceability, coupons, orders, returns, and basic sales reports.
5. **Trust and compliance:** clear seller/contact details, shipping/return/privacy/terms pages, product labels and usage directions, customer support contact, and accurate claims. Have local counsel/accounting review applicable requirements before launch.

## Default hosting target: GoDaddy

Use GoDaddy Node.js Hosting as the project default for the production web app and API. GoDaddy supports Node.js apps with preview and publish deployments; publishing requires an eligible active GoDaddy Web Hosting plan and available app slot. Keep the application portable so another Node.js host remains possible if requirements change. The existing standalone HTML prototype can be deployed as a static site during the design stage; the production storefront and API should use the Node.js app deployment path.

### Current account implementation

The repository's customer-account slice uses GoDaddy MySQL via `DATABASE_URL` or `DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`. This is a deliberate fit for the selected Node.js hosting target and the current dependency-light server; it is separate from the future PostgreSQL + Prisma recommendation below. Do not point it at the future PostgreSQL schema. Before enabling it, provision MySQL in the chosen GoDaddy app, set MSG91 `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` as publish secrets, and run `npm run migrate:customers` against that database once. Keep provider keys in GoDaddy secrets, never in source control.

## Suggested technology

- **Web:** Next.js + TypeScript for storefront and admin UI; migrate the present visual design into reusable components.
- **API:** Node.js + TypeScript using Fastify (or Express if the team already knows it), with request validation and versioned REST endpoints.
- **Database:** PostgreSQL + Prisma migrations. PostgreSQL is the source of truth for products, stock, customers, orders, payments, and audit history.
- **Images:** object storage with a CDN; store image URLs and metadata in PostgreSQL.
- **Payments:** Razorpay order creation and signed webhook verification on the server. Never trust a browser success screen as proof of payment.
- **Shipping:** start with an admin-configured PIN-code/rate table and manual fulfillment; add a courier aggregator integration after order operations are stable.
- **Deployment:** GoDaddy Node.js Hosting is the default host for the Next.js web app and Node API (initially deploy as one app where practical). Use GoDaddy preview deployments before publishing. The app must include root-level `package.json` with `build` and `start` scripts and listen on `process.env.PORT`; keep runtime packages in `dependencies`. Host PostgreSQL and image storage as managed external services, and configure their credentials as GoDaddy environment secrets. Add Redis/queues only when background work or traffic requires them.

## Backend layout

```text
agroseed/
  apps/
    web/                         # storefront and admin pages
    api/
      src/
        app.ts
        config/                  # environment validation
        middleware/              # auth, rate limits, request IDs
        modules/
          auth/
          customers/
          catalog/               # products, categories, brands, variants
          inventory/
          serviceability/        # PIN codes, shipping quotes
          cart/
          checkout/
          orders/
          payments/              # gateway adapter + webhooks
          promotions/
          shipping/
          support/
          admin/
        lib/                     # database, logging, validation
      prisma/
        schema.prisma
        migrations/
        seed.ts
  packages/
    shared/                      # request/response types and validation
  docs/
    api.md
    operations.md
  .env.example                  # document required GoDaddy app secrets; never commit real values
```

## Core data model

- `User`: phone, name, email (optional), status, created timestamp.
- `Address`: user, recipient, phone, address lines, village/city, state, PIN code, delivery notes; mark one default.
- `Category` and `Brand`: names in Hindi and English, slug, active status, display order.
- `Product`: SKU, slug, bilingual title/description, brand, category, images, label/usage fields, active status.
- `ProductVariant`: product, pack size/unit, SKU, MRP, selling price, tax classification, weight, active status.
- `Inventory`: variant, available quantity, reserved quantity, reorder threshold; update through inventory transactions.
- `Cart` and `CartItem`: user or guest token, variant, quantity. Treat cart prices as display hints; reprice at checkout.
- `Order`: human-readable order number, user/contact snapshot, address snapshot, status, subtotal, discount, shipping, tax, total, payment method/status, timestamps.
- `OrderItem`: order, SKU/name/pack/price/tax snapshot, quantity, line total. Preserve snapshot values when catalog changes.
- `Payment`: order, gateway, gateway order/payment IDs, amount, status, verified webhook details.
- `Coupon`: code, validity, limits, discount rules, eligible categories/products, active status.
- `Shipment`: order, carrier, tracking number/link, status, shipped/delivered timestamps.
- `InventoryTransaction` and `AdminAuditLog`: immutable stock adjustments and staff action history.

Money should use integer paise, not floating-point rupees. Store timestamps in UTC and display them in the customer's local context.

## API outline (all under `/api/v1`)

```text
GET    /catalog/categories
GET    /catalog/products?q=&category=&brand=&sort=&page=
GET    /catalog/products/:slug
GET    /serviceability/:pincode
POST   /auth/otp/request
POST   /auth/otp/verify
GET    /cart
POST   /cart/items
PATCH  /cart/items/:id
DELETE /cart/items/:id
POST   /checkout/quote
POST   /orders                         # reserve stock and create pending order
POST   /payments/razorpay/order        # create gateway order for an AgroSeed order
POST   /payments/razorpay/webhook      # verify signature; idempotent
GET    /orders/:orderNumber            # authenticated owner or secure lookup token
GET    /me/orders
POST   /support/requests

# Admin routes require staff role and are separately audited
POST/PATCH/GET /admin/products
POST/PATCH/GET /admin/inventory
GET/PATCH      /admin/orders/:orderNumber
POST           /admin/orders/:orderNumber/ship
POST/PATCH/GET /admin/coupons
GET            /admin/reports/sales
```

## Order and stock lifecycle

1. Browser sends variant IDs, quantities, address/PIN, and coupon code. Server loads current prices and serviceability, recalculates tax/discount/shipping, and returns a quote with expiry.
2. On order submission, a database transaction rechecks stock and quote inputs, reserves stock, saves immutable order-item snapshots, and creates a pending order.
3. For prepaid orders, API creates a payment order with the gateway and returns only the public checkout details. For COD, mark payment as pending collection and queue fulfillment according to policy.
4. Payment webhook signature is verified server-side. Process each gateway event idempotently; paid orders move to confirmed and reserved stock becomes committed.
5. Failed/expired payments release reservations. Admin fulfillment records shipment and tracking. Delivery, cancellation, return, and refund transitions are recorded in the order history.

## Security and reliability basics

- Keep secrets in environment variables; commit only `.env.example`.
- Hash OTPs, set short expiry and attempt limits, and rate-limit OTP, login, checkout, and order lookup.
- Enforce ownership checks on customer orders; require staff roles for admin routes.
- Validate every request and escape output; use CSRF protections for cookie-based sessions.
- Use database transactions for order/stock changes and idempotency keys for checkout/payment events.
- Do not store card details or trust client-supplied price, discount, tax, or payment status.
- Keep an audit trail for manual price, stock, order, and refund changes.

## Build sequence

1. Set up local development and GoDaddy Preview with a separate staging database, fake seed data, and payment-provider test credentials.
2. Create the web/API app structure, PostgreSQL schema, migrations, seed data, and environment config.
3. Move prototype catalog data into the database; connect storefront search, filters, variants, and cart to API endpoints.
4. Implement customer OTP and address/PIN-code flow; then quote and order creation with stock reservation.
5. Add payment gateway sandbox and webhook handling; add COD and order tracking.
6. Build admin catalog, inventory, and order screens; add shipping operations and customer notifications.
7. Confirm launch catalog, fulfillment area, shipping rules, COD policy, support contact, and legal business details. Configure production secrets and database; back up, then publish on an eligible GoDaddy Web Hosting plan with the production domain and begin in a limited service area.

## Sandbox and staging setup (first step)

1. Use GoDaddy's private `PREVIEW` variant as the hosted staging website. Upload and inspect changes there; publishing promotes the reviewed preview app to `PUBLISH` production.
2. Provision a separate staging PostgreSQL database and a separate production database. Set `DATABASE_URL` independently for the `PREVIEW` and `PUBLISH` variants. Do not point preview to production data: GoDaddy preview and production may share the same database if configured with the same connection.
3. Use payment-provider test credentials and test webhooks in preview; keep live credentials only in `PUBLISH`. Also separate OTP/SMS and email credentials or use safe test adapters in preview.
4. Seed preview with fake products, customers, addresses, and orders. Never use real customer data for staging.
5. Keep local development separate too (`.env.local` or equivalent, excluded from Git); document required variable names in `.env.example` without real values.
6. Before launch, verify the preview URL, database connection, test checkout, payment webhook, and order lifecycle. Then configure production secrets and database, take a backup, and publish.


## GoDaddy deployment notes

- GoDaddy is the selected default hosting provider for this project. Create the Node.js app in GoDaddy Hosting, deploy previews while iterating, and publish only after the production configuration is ready.
- Add a production `package.json` at the uploaded app root with `build` and `start` scripts. Bind the server to `process.env.PORT`; use GoDaddy-managed environment secrets for database, payment, OTP, and storage credentials.
- Keep PostgreSQL backups and image assets outside the app deployment bundle. Deploy code without `node_modules`; run database migrations deliberately against the intended environment.
- GoDaddy hosting account, Web Hosting plan/app slot, domain, and service credentials are not configured in this workspace, so no live deployment or purchase has been made.

## Decisions needed before implementation

- Confirm that “sales site” means a customer-facing AgroSeed online store.
- Confirm launch region/PIN codes, delivery partners, COD availability, and who will fulfill orders.
- Provide the actual product catalog (SKUs, pack sizes, prices, stock, images, and label/usage information).
- Choose whether to preserve the current standalone HTML prototype as a visual reference or migrate its design into Next.js components.





