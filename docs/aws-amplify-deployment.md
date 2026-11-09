# AWS Amplify deployment

The storefront and API run in one Node.js server. Amplify must publish the server compute bundle, not treat the GoDaddy preview ZIP as a static site.

## Build and artifact settings

The root `amplify.yml` installs dependencies, runs `npm run build`, and publishes `.amplify-hosting/`. The build keeps the GoDaddy ZIP and also creates the Amplify deployment manifest and self-contained Node.js 22 compute bundle.

The Amplify compute server listens on the `PORT` supplied by the platform (Amplify compute uses port 3000). The bundle routes requests through the server, which serves both the storefront files and API.

## Amplify app environment

Set these values in the Amplify app's environment settings:

```text
NODE_ENV=production
AGROSEED_DEMO_MODE=false
```

Do not set `PORT`; Amplify supplies it. Add database and provider credentials only in the AWS app's secret/environment settings, never in Git.

The `Failed to set up process.env.secrets` warning means Amplify could not read its configured SSM parameter path. It did not cause the missing `index.html` warning. Configure the referenced parameters in AWS Systems Manager Parameter Store or remove the unused secret path configuration.

## Data persistence and launch readiness

Amplify compute has ephemeral storage and only `/tmp` is writable. Do not use the local JSON preview store or local upload directory as durable production storage. Product, order, and inventory persistence still needs a production database; uploaded product images need durable object storage such as S3. These workflows must be connected before opening checkout to real customers.
