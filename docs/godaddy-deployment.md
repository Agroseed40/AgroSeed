# GoDaddy Node.js Hosting: Requirements and AgroSeed audit

Research checked against GoDaddy's official Node.js Hosting requirements, API docs, and hosting page on 8 Nov 2026.

## Platform requirements

GoDaddy Node.js Hosting currently runs Node.js 22. The `engines` value in `package.json` documents compatibility; it does not select another runtime version. GoDaddy accepts a ZIP upload or a connected GitHub repository and builds a private Preview before publishing.

For a ZIP upload:

1. Put `package.json` at the **root of the ZIP** (do not wrap the project inside an extra parent folder).
2. Give it a non-empty `name` and `version`, and define both `build` and `start` scripts. GoDaddy runs the build script during deploy and starts the app with `npm start`.
3. Read the web port from `process.env.PORT`; don't hardcode a production port. Bind the Node server to `0.0.0.0`.
4. Declare every imported third-party runtime package in `dependencies`. GoDaddy installs dependencies from the manifest after extracting the ZIP. Keep a matching lockfile when dependencies are introduced; don't put a runtime-only package in `devDependencies`.
5. Include source files and runtime assets. Exclude `node_modules`, `.env` files containing secrets, and local/uncommitted build output.
6. Configure credentials as encrypted app environment variables. GoDaddy supports separate secret values for the Preview and Publish variants.

GoDaddy's private Preview is available before publishing. Publishing requires an eligible active GoDaddy Web Hosting plan with an available app slot. The Preview and Publish variants have separate code, URLs, and secrets, but must use different database connection values if their data is to be isolated. Never point Preview at production data.

Sources: [Node.js app requirements](https://developer.godaddy.com/en/docs/api-users/hosting/app-requirements), [hosting concepts](https://developer.godaddy.com/en/docs/api-users/hosting/concepts), [manage app secrets](https://developer.godaddy.com/en/docs/api-users/hosting/manage-secrets), [GoDaddy Node.js Hosting](https://www.godaddy.com/en-in/hosting/nodejs).

## Current AgroSeed dependency audit

- Runtime: Node built-ins plus `mysql2` for the customer-account database integration.
- Browser files are grouped under `public/`. The old one-page mock storefront and unused catalog prototype have been retired to `docs/archive/retired-prototype/` and are not served or deployed.
- Preview catalog, staff and order APIs are disabled in `NODE_ENV=production` or when `AGROSEED_DEMO_MODE=false`. Local preview orders, catalog edits, settings and support requests use `storage/sandbox-store.json`; customer accounts use MySQL when configured. GoDaddy advertises managed MySQL; confirm connection details in the account.
- Startup validates the supported `NODE_ENV`, integer `PORT` range, and boolean preview/debug/order flags. Invalid values fail with a configuration error before the server listens.
- Admin image uploads are validated and stored under `storage/uploads/` locally. This folder is excluded from the deployment bundle. Use client-owned object storage before launch.
- Install dependencies with `npm ci`; GoDaddy also installs from the manifest during deployment.

## AgroSeed deployment bundle

`dist/agroseed-preview.zip` is built with `package.json` at its root. It contains:

```text
package.json
package-lock.json
server.mjs
config/features.mjs
backend/api.mjs
backend/sandbox.mjs
backend/seed/products.json
scripts/build-check.mjs
scripts/godaddy-preflight.mjs
public/
  app.html
  app.css
  app.js
backend/customer-auth.mjs
backend/migrations/001_customer_accounts.sql
backend/migrations/002_customer_carts.sql
scripts/migrate-customer-accounts.mjs
```

Run `npm run migrate:customers` after setting the client-owned MySQL connection. The migration script applies all numbered SQL files in `backend/migrations/`, including customer account and cart tables.

The local generated file `storage/sandbox-store.json`, uploaded local images, `.env` files, `.git`, `node_modules`, and the `dist/` directory are excluded from the ZIP. The build and preflight scripts catch missing deployment files, manifest/lock mismatches, unlisted external imports, and incorrect port binding before upload. Build the refreshed artifact with `node scripts/package-preview.mjs`.

Run the local checks with:

```powershell
node scripts/build-check.mjs
node scripts/godaddy-preflight.mjs
```

Before uploading, refresh the ZIP from the current source and verify it still has `package.json` at its top level. If a new package is added, install it into `dependencies`, update `package-lock.json`, rerun preflight, and rebuild the ZIP.

## Demo content and launch switch

`AGROSEED_DEMO_MODE` is the single master switch:

- Local development defaults to demo mode on.
- GoDaddy `PREVIEW`: keep demo mode on and use a separate staging database if evaluating customer-account integration. Local JSON-backed order/admin workflows are not durable hosted services.
- GoDaddy `PUBLISH`: set `AGROSEED_DEMO_MODE=false` until live catalog, account, delivery, checkout, and support integrations replace the mocks. When false, demo-only UI is hidden and demo catalog/order API routes return a disabled response.

The active app displays its preview banner and uses sandbox catalog/order APIs only when demo mode is on. Its sample catalog remains under `backend/seed/`, and local preview state is under `storage/`. The retired prototype pages, generated brand graphics, and debug menu are excluded from the deployment package.


Never assume GoDaddy Preview implies a separate database. Set a test-only `DATABASE_URL` for Preview and a production `DATABASE_URL` for Publish once a real database is connected. Keep test payment credentials in Preview and live credentials only in Publish.
