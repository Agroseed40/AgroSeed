# AWS Amplify deployment

The storefront and API run in one Node.js server. Amplify must publish the server compute bundle, not treat the GoDaddy preview ZIP as a static site.

## Build and artifact settings

The root `amplify.yml` installs dependencies, runs `npm run build`, and publishes `.amplify-hosting/`. The build keeps the GoDaddy ZIP and also creates the Amplify deployment manifest and self-contained Node.js 22 compute bundle.

The Amplify compute server listens on the `PORT` supplied by the platform (Amplify compute uses port 3000). The bundle routes requests through the server, which serves both the storefront files and API. Its entrypoint explicitly selects the sandbox preview mode and places preview data in `/tmp/agroseed`, because Amplify compute does not allow writes beside the deployed application files.

## Amplify app environment

This Amplify bundle is a public staging preview, not a production store. The entrypoint sets `NODE_ENV=development`, `AGROSEED_DEMO_MODE=true`, and `AGROSEED_STORAGE_DIR=/tmp/agroseed` in the compute process. Do not set `PORT`; Amplify supplies it. The preview filesystem is temporary, so products, settings, and preview orders can disappear or differ between compute instances.

Do not connect real customers, payments, or orders to this preview. Production requires a durable catalog/order database and durable product image storage. Add database and provider credentials only through AWS secret/environment settings, never in Git.

The `Failed to set up process.env.secrets` warning means Amplify could not read its configured SSM parameter path. It does not cause the sandbox file-write error. Configure the referenced parameters in AWS Systems Manager Parameter Store when the production services are ready, or remove the unused secret path configuration.

## Data persistence and launch readiness

Amplify compute has ephemeral storage and only `/tmp` is writable. Do not use the local JSON preview store or local upload directory as durable production storage. Product, order, and inventory persistence still needs a production database; uploaded product images need durable object storage such as S3. These workflows must be connected before opening checkout to real customers.
