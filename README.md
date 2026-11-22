# AgroSeed

AgroSeed runs on Cloudflare Workers and Cloudflare D1. The storefront and staff console share the same Worker. The catalog starts empty and staff can add approved products in `/admin`. Checkout displays the delivery form and order summary with submission disabled.

## Local development

Use Node.js 22 and the checked-in Wrangler version.

```sh
npm ci
npx wrangler d1 migrations apply agroseed-db --local
npm run dev
```

Copy `.env.example` to `.dev.vars` and set a local staff password. The localhost Worker supports staff sign-in. Customer email authentication uses the hosted Access application.

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
