# AgroSeed sandbox

This Node.js app includes a bilingual storefront, local catalog API, guest cart and checkout preview, private-token order lookup, and a password-protected staff console. Preview state uses `storage/sandbox-store.json`. Customer sign-in uses Cognito SMS OTP when the user pool is configured. Saved account data uses MySQL when configured; the local sandbox does not send SMS.

All demo-only areas use the `AGROSEED_DEMO_MODE` environment setting. Local development defaults to `true`; set it to `false` to hide mock UI and block sandbox catalog/order API routes. See [GoDaddy deployment requirements and audit](../godaddy-deployment.md) for deployment configuration.

## Run locally

Requires Node.js 22 or newer. Install the locked dependencies once with `npm ci` from the project root.

```powershell
$env:NODE_ENV = "development"
$env:AGROSEED_DEMO_MODE = "true"
$env:AGROSEED_ADMIN_PASSWORD = "choose-a-local-preview-password"
node server.mjs
```

The frontend and backend run together in **one Node process**; there is no separate frontend command. Open `http://localhost:3000`. The web health endpoint is `http://localhost:3000/health`; the API health endpoint is `http://localhost:3000/api/v1/health`. To use another port, set `PORT` before starting the app.

Startup rejects unsupported `NODE_ENV` values, invalid `PORT` values, and unrecognized boolean values for `AGROSEED_DEMO_MODE` or `AGROSEED_ALLOW_SANDBOX_ORDERS`.

The storefront is at `http://localhost:3000`; the staff console is at `/admin`. Set `AGROSEED_ADMIN_PASSWORD` in the local environment before signing in. The DEV tab remains available locally for API health checks and sample orders.

To recover local staff access, set a new `AGROSEED_ADMIN_PASSWORD` in the same environment and restart the Node process. Existing staff sessions expire after eight hours; sign-out clears the current session.

## Local API

- `GET /api/v1/products` — list published preview products with search, filters and pagination.
- `GET /api/v1/products/:slug` — fetch product details and pack variants.
- `POST /api/v1/checkout/quote` — recalculate prices, stock, promotions and configured delivery areas.
- `POST /api/v1/orders` — save a sandbox order and adjust local sample stock; the private tracking token is returned once.
- `GET /api/v1/orders/:orderNumber` — secure lookup with the token in an `Authorization: Bearer` header.
- `/api/v1/admin/*` — protected local product, inventory, order, support, promotion, delivery, reporting and audit workflows.

## Switch demo content off

PowerShell, before starting a local production-mode preview:

```powershell
$env:AGROSEED_DEMO_MODE = "false"
node server.mjs
```

Use `true` to turn the demo features back on. GoDaddy Preview and Publish need separate values in their app environment settings: keep Preview at `true`; set Publish to `false` until its real catalog and integrations are connected.

Checkout accepts delivery details but does not pass them to a carrier, take payment, or notify a customer. Orders are labeled `sandbox_pending`. With no approved delivery areas configured, quotes are marked preview-only and use no delivery fee.

All demo catalog, staff and order APIs are disabled when `NODE_ENV=production` or `AGROSEED_DEMO_MODE=false`. Product image uploads go into `storage/uploads/` locally and need client-owned object storage before launch.

## GoDaddy Preview workflow

1. In GoDaddy Node.js Hosting, create an app named AgroSeed Sandbox and upload `dist/agroseed-preview.zip`, or connect the project through GoDaddy's supported GitHub flow.
2. Deploy to the private `PREVIEW` variant and open its preview URL to inspect the storefront.
3. Set `AGROSEED_DEMO_MODE=true` for `PREVIEW`; keep test credentials and fake data there. Set it to `false` for `PUBLISH` until real integrations replace the demo layers.
4. If/when a database is connected, use a dedicated staging database for Preview and a separate production database for Publish. GoDaddy's preview and production variants can otherwise point at the same database.
5. Publish only after the staging app and its environment have been reviewed. Do not add production secrets to Preview.

GoDaddy hosting account access, an app, and a remote preview URL are not configured by repository files alone. The Preview deployment still needs to be created from the GoDaddy account. Do not accept paid plan upgrades or legal terms as part of sandbox setup without the account owner's action.

