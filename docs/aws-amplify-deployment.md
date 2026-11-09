# AWS Amplify deployment

The storefront and API run in one Node.js server. Amplify must publish the server compute bundle, not treat the GoDaddy preview ZIP as a static site.

## Build and artifact settings

The root `amplify.yml` installs dependencies, runs `npm run build`, and publishes `.amplify-hosting/`. The build keeps the GoDaddy ZIP and also creates the Amplify deployment manifest and self-contained Node.js 22 compute bundle.

The Amplify compute server listens on the `PORT` supplied by the platform (Amplify compute uses port 3000). The bundle routes requests through the server, which serves both the storefront files and API. Its entrypoint explicitly selects the sandbox preview mode and places preview data in `/tmp/agroseed`, because Amplify compute does not allow writes beside the deployed application files.

## Amplify app environment

This Amplify bundle is a public staging preview, not a production store. The entrypoint sets `NODE_ENV=development`, `AGROSEED_DEMO_MODE=true`, and `AGROSEED_STORAGE_DIR=/tmp/agroseed` in the compute process. Do not set `PORT`; Amplify supplies it. The preview filesystem is temporary, so products, settings, and preview orders can disappear or differ between compute instances.

## Customer phone sign-in

Customer sign-in uses Amazon Cognito SMS OTP through the app's Node.js API. The storefront remains hosted on Amplify. The build includes the Cognito user-pool ID and app-client ID supplied for AgroSeed; set `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID` in Amplify build settings to override them if they change. These identifiers are public and the Amplify bundle carries them into the Node compute runtime. `COGNITO_REGION` is optional because it can be derived from the pool ID. Use an app client with no client secret.

Configure the Cognito user pool before deployment:

1. Set phone number as the customer sign-in identifier, enable automatic phone verification, and allow SMS OTP as a first sign-in factor.
2. Enable the `USER_AUTH` and refresh-token flows on the app client (`ALLOW_USER_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH`).
3. Configure SMS delivery through Amazon SNS or AWS End User Messaging SMS. For production delivery in India, complete required sender and DLT registration. New AWS SMS accounts can be restricted to verified numbers until production access is approved.
4. Set the user pool to a plan that supports passwordless SMS OTP. AWS currently requires Essentials tier or higher for passwordless sign-in.
5. Redeploy, then test sign-up and returning-customer sign-in with a phone you control.

OTP request, challenge response, and token verification run on the server. The server verifies Cognito ID tokens and stores them in HttpOnly cookies. Cognito handles identity; MySQL remains optional for sign-in and is still required by the current app for saved carts and addresses. Apply `npm run migrate:customers` after MySQL is configured to enable those saved customer features.
## Data persistence and launch readiness

Amplify compute has ephemeral storage and only `/tmp` is writable. Do not use the local JSON preview store or local upload directory as durable production storage. Product, order, and inventory persistence still needs a production database; uploaded product images need durable object storage such as S3. These workflows must be connected before opening checkout to real customers.




