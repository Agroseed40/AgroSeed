# AgroSeed

AgroSeed is a Node.js storefront and API for an Indian farm-supplies store. The storefront and backend run in one process. The build creates a GoDaddy preview ZIP and an AWS Amplify server deployment bundle.

## Run the preview

Requires Node.js 22 or newer.

```powershell
npm ci
$env:NODE_ENV = "development"
$env:AGROSEED_DEMO_MODE = "true"
$env:AGROSEED_ADMIN_PASSWORD = "set-a-local-password"
npm run dev
```

Open `http://localhost:3000`. The storefront is `/`, the staff preview is `/admin`, and the server health endpoint is `/health`. Preview data is written to `storage/sandbox-store.json`.

## Project layout

```text
public/             Browser pages, styles, scripts, and static images
backend/            API handlers, seed catalog, and database migrations
config/             Runtime feature configuration
storage/            Local preview data and uploaded files (ignored by Git)
scripts/            Build checks, GoDaddy packaging, and database migration
docs/project/       E-commerce plan, development roadmap, task backlog
docs/development/   Local sandbox instructions
docs/               Deployment and delivery documentation
server.mjs          HTTP server entry point
package.json        Runtime commands and dependencies
```

## Useful commands

```powershell
npm run build                 # Check files and create GoDaddy and Amplify deployment packages
npm run migrate:customers     # Apply customer-account tables to configured MySQL
```

AWS Amplify uses the `amplify.yml` build settings and deploys `.amplify-hosting/`. Configure `NODE_ENV=production` and `AGROSEED_DEMO_MODE=false` in the Amplify app environment before publishing. The app needs a production database and approved service credentials before live customer workflows can be enabled. See [AWS Amplify deployment notes](docs/aws-amplify-deployment.md).

The customer-account migration requires `DATABASE_URL` or the `DB_*` settings. Real phone verification also requires MSG91 credentials. Do not put production secrets in source files.

The obsolete one-page mock storefront, mock catalog page, fake sponsored cards, brand demo graphics, and debug menu have been retired from the app and GoDaddy package. Their source is retained under `docs/archive/retired-prototype/`. The sample seed catalog and sandbox API remain because the current app still uses them when `AGROSEED_DEMO_MODE=true`; replace those services with the live catalog and order database before removing them.
