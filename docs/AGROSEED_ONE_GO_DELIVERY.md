# AgroSeed one-go build: delivery and remaining work

As of 9 November 2026, the task backlog records **44 complete, 8 in progress, 21 waiting on client inputs or external services, and 0 not started**. Complete means the preview-level behavior is implemented or a required decision is recorded; in-progress items are being actively worked; waiting items need production backing or client-approved content.

## Delivered in this workspace

- Responsive, farmer-focused storefront with prominent coupon deals, special-price shelf, category shortcuts, plain product-finding copy, search, category and brand browsing, variants, and denser paginated catalog browsing.
- Guest cart with browser UX and server-side preview persistence under a random cart ID (stored as a hash and expired after 30 days), legacy saved-cart migration, and idempotent merge into a MySQL-backed signed-in customer cart. Quantity editing/removal, promotion-code entry, checkout address fields, saved profile and multiple-address conveniences, and server-calculated preview quotes are included. Account cart storage requires the customer database migration.
- Sandbox order creation, confirmation, private-token tracking, local account order list, and preview contact/support inbox.
- Password-protected single-owner staff console with product search/status filters/pagination, edit/publish/archive, featured placement, multi-image upload/gallery order/alt text, validated CSV preview/import, available/reserved inventory tracking, category/brand controls, promotion validity and usage limits, delivery-area fees/estimates, and date-filtered reports.
- Server-side Owner/Admin, Catalog, and Orders role permission checks; admin navigation adapts to the session role. Persistent staff account invitations and role assignment remain for AS-068.
- Product detail photo gallery and preview PIN serviceability check; route-specific title and description, canonical URL, Open Graph, and Twitter metadata, with product photos in share metadata when uploaded. Admin order search/filter/pagination, detail history, allowed fulfillment transitions, tracking references, return/refund records, cancellation stock release, shipment reservation fulfillment, and 24-hour expiry/release for pending sandbox orders.
- Admin-editable, blank-by-default fields for business/support copy, home-page copy, delivery/COD/cancellation rules, and privacy/terms/shipping text. Public pages display a clear not-configured notice until approved content is entered; no legal or operating policy has been invented.
- Runtime checks for NODE_ENV, PORT, and boolean feature settings. Invalid configuration fails with a clear startup message; `.env.example` contains no real credentials.
- Preview APIs are disabled in production mode. Staff sessions use an HTTP-only SameSite cookie, CSRF token and login throttling. Tracking persists only a hash of the private lookup token.
- Dependency-free Node 22 app, GoDaddy preflight/build scripts, sandbox instructions, and a generated preview ZIP.
- Responsive and bilingual review of the home, catalog, and product flows at phone (375 px), tablet (768 px), and desktop (1366 px) widths. English/Hindi copy and dynamic stock/pack labels were checked; missed catalog and footer strings were translated.

## Remaining work

These items need client decisions, external accounts, or a production backend. The preview does not turn them into live services.

| Backlog items | Remaining work | Needed to finish |
|---|---|---|
| AS-003 to AS-006 | Approve delivery/returns/COD rules, catalog and bilingual product content, provider/account ownership, and staging acceptance scope. | Client-approved rules, product data, contacts, provider decisions and acceptance criteria. |
| AS-016 to AS-020 | Production database models, migrations, repeatable seeds, and persistent data validation. Local JSON files are preview-only. | Managed database choice, staging/production connections, schema direction and deployment setup. |
| AS-021 | Durable image storage/CDN. Current uploads are stored on the local filesystem; gallery order and alt text are implemented in the preview. | Client-owned object storage, access credentials, and approved image set. |
| AS-044 | Run the customer cart migration and verify account cart merge after a real OTP sign-in. | Cognito SMS OTP configuration and staging sign-in; MySQL is needed for persisted account carts. |
| AS-048 | Configure tax handling and connect quotes to production catalog prices; the preview explicitly excludes tax. | Approved tax rules and production catalog/price source. |
| AS-068 | Persistent staff accounts, invitations, role assignment, and durable identity/audit records. The preview currently issues one Owner session; role access checks are in place. | Identity/database service and approved staff roster. |
| AS-034 | ZIP media import and SKU-to-image mapping report. | Approved bulk catalog/media files and storage destination. |
| AS-049 | Production database transactions and orders; the preview serializes inventory reservations in local JSON. | Production database and staging acceptance. |
| AS-051 to AS-053, AS-057 to AS-058 | Payment provider and signed webhooks, COD policy, customer OTP, and email/SMS notifications. | Client-owned sandbox/live accounts, credentials, message templates and operating rules. |
| AS-056 | Payment-failure stock release. The preview records cancellation release and 24-hour pending-order expiry. | Persistent order backend and payment provider. |
| AS-059 to AS-060 | Verified customer profile, cross-device addresses and authoritative order history. Current conveniences stay in the browser and rely on private order tokens. | Verified OTP identity and customer database. |
| AS-061 to AS-063 | Route messages to a monitored support destination, publish approved legal/business content, and decide guides/newsletter scope. | Monitored support contact, approved policies and scope decision. |
| AS-066, AS-068 | Approved shipping/COD rules, production service-area settings and multi-staff accounts/roles. Local preview controls cover PIN fees/estimates and single-owner settings. | Approved rules and persistent backend/identity service. |
| AS-069 to AS-073 | Independent security/recovery review, client bilingual/mobile acceptance, staging sign-off, production cutover, staff training and handoff. | Staging access, client approvals, production secrets, approved catalog and deployment account. |

## Run the preview

Use Node.js 22 or newer. In PowerShell, set a local staff password before starting the app:

```powershell
$env:NODE_ENV = "development"
$env:AGROSEED_DEMO_MODE = "true"
$env:AGROSEED_ADMIN_PASSWORD = "choose-a-local-preview-password"
node server.mjs
```

Open `http://localhost:3000` for the store and `http://localhost:3000/admin` for staff tools. Sample orders, addresses, uploads and customer messages are preview data. Do not use real customer catalog or payment information in this local sandbox.

## Launch gate

The site is ready for local review, not live sales. Complete the remaining database, identity, payment, support, policy, operational, staging and client-acceptance work before enabling production commerce. In `NODE_ENV=production`, the preview APIs are disabled.

