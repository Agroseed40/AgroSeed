# AgroSeed

AgroSeed is a farm-supplies storefront and API running on Cloudflare Workers with Cloudflare D1. This branch deploys a public preview on `workers.dev` and preserves the existing storefront design.

## Live preview

- Storefront: <https://agroseed-preview.durgesh5757g.workers.dev>
- Staff console: <https://agroseed-preview.durgesh5757g.workers.dev/admin>
- D1 database: `agroseed-db`

This is a preview environment. It uses a sample catalog and demo prices. Checkout creates only a sandbox order; no payment provider or real checkout is enabled.

## Local development

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Wrangler serves the Worker locally, normally at `http://localhost:8787`. Local development uses a local D1 database. To apply the checked-in migrations locally:

```sh
npx wrangler d1 migrations apply agroseed-db --local
```

For local staff-console testing, create a `.dev.vars` file with a non-production `AGROSEED_ADMIN_PASSWORD`. Do not commit that file. `.env.example` lists the preview flags.

## Deploy

Authenticate the Wrangler CLI to Cloudflare, then run:

```sh
npm run build
npm run deploy
```

The Worker uses the `DB` D1 binding in `wrangler.toml`. The production staff password is a Worker secret, set with `npx wrangler secret put AGROSEED_ADMIN_PASSWORD`.

## Authentication and storage

Customer account API routes use Cloudflare Access with email one-time PIN authentication. The Access application protects `/api/v1/customer/*`; the storefront remains public. Customer profiles, saved carts, addresses, staff sessions, login limits, and app state are stored in D1.

R2 is not configured. Product image uploads are not part of this preview; the existing storefront assets are bundled into the Worker.

## Before a real launch

Replace the sample catalog and prices, verify customer email-code sign-in and account flows, set business and fulfilment policies, configure durable image storage if needed, and run a complete checkout verification with a payment provider. Keep real checkout disabled until those checks are complete.
