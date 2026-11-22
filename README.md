# AgroSeed

AgroSeed runs on Cloudflare Workers and Cloudflare D1. The storefront and staff console share the same Worker. The catalog starts empty and staff can add approved products in `/admin`. Checkout supports Razorpay test payments; delivery order placement remains disabled.

## Local development

Use Node.js 22 and the checked-in Wrangler version.

```sh
npm ci
npx wrangler d1 migrations apply agroseed-db --local
npm test
npm run dev
```

Copy `.env.example` to `.dev.vars` and set a local staff password and Razorpay test key pair. `.env` may contain the same values for local tooling, but Wrangler reads `.dev.vars` for local Worker bindings. Both files are ignored by Git. The localhost Worker supports staff sign-in. Customer email authentication uses the hosted Access application.

## Razorpay test checkout

After installing dependencies and applying the local D1 migrations, configure Cloudflare Access customer sign-in, add a published product with stock and a price of at least ₹1, save a delivery address to a verified customer account, add products to the signed-in bag, and open `/checkout`. Checkout requires an Access-authenticated customer and a saved address. The Worker reads the customer cart and address from D1, recalculates the total, reserves stock, creates a Razorpay test order, and verifies the returned signature. A successful test payment creates a clearly labeled test order in the existing D1 app state; the customer can track status in `/account/orders`, and staff can update it in `/admin/orders`. Cancelling an unpaid test attempt releases reserved stock. Test orders do not represent real funds or customer fulfillment.

For a deployed test environment, configure `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` as Worker secrets with `npx wrangler secret put RAZORPAY_KEY_ID` and `npx wrangler secret put RAZORPAY_KEY_SECRET`, then deploy. Only `rzp_test_` keys are accepted. Do not switch to live keys until fulfillment, payment capture checks, order reconciliation, and refund handling are implemented.

## Cloudflare deployment

```sh
npm run build
npx wrangler d1 migrations apply agroseed-db --remote
npm run deploy
```

Deploy to the existing `agroseed-preview` Worker. Keep the `AGROSEED_ADMIN_PASSWORD` Worker secret and the existing D1 binding. The site is served at https://agroseed-preview.durgesh5757g.workers.dev.

## Customer accounts

Cloudflare Access protects `/api/v1/customer/*` with email one-time PIN. The first verified sign-in creates the D1 customer profile. Subsequent sign-ins use the same profile. Signing out uses the application domain's Access logout endpoint. Keep the Access application path, issuer and audience aligned with `wrangler.toml`.

## Data

D1 stores customer profiles, addresses, carts, staff sessions, and merchant-managed store records. Guest carts use their own table with a 30-day expiry. The catalog, inventory, settings, promotions, and audit records share a versioned state row so related changes commit together. Migration 0004 removes the identified seed products and releases outstanding preview reservations while retaining legacy order records privately in D1. Product uploads are deferred. The storefront logo ships with the Worker.
