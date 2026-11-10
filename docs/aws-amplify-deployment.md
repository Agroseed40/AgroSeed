# AWS Amplify deployment

The storefront and API run in one Node.js server. Amplify must publish the server compute bundle, not treat the GoDaddy preview ZIP as a static site.

## Build and artifact settings

The root `amplify.yml` installs dependencies, runs `npm run build`, and publishes `.amplify-hosting/`. The build keeps the GoDaddy ZIP and also creates the Amplify deployment manifest and self-contained Node.js 22 compute bundle.

The Amplify compute server listens on the `PORT` supplied by the platform (Amplify compute uses port 3000). The bundle routes requests through the server, which serves both the storefront files and API. Its entrypoint explicitly selects the sandbox preview mode and places preview data in `/tmp/agroseed`, because Amplify compute does not allow writes beside the deployed application files.

## Amplify app environment

This Amplify bundle is a public staging preview, not a production store. The entrypoint sets `NODE_ENV=development`, `AGROSEED_DEMO_MODE=true`, and `AGROSEED_STORAGE_DIR=/tmp/agroseed` in the compute process. Do not set `PORT`; Amplify supplies it. The preview filesystem is temporary, so products, settings, and preview orders can disappear or differ between compute instances.

## Cognito Managed Login

The storefront sends `/account/login` directly to Cognito Managed Login; there is no separate in-store sign-in form. Cognito hosts sign-in, sign-up, and account recovery. After authorization, Cognito returns to the Node callback, the server exchanges the authorization code with PKCE, validates the ID token, and stores the session in HttpOnly cookies. Successful sign-in returns the customer to `/`.

Set these environment variables in Amplify build settings (the package script carries build-time values into the compute bundle):

- `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID` (the client must be a public app client without a client secret).
- `COGNITO_DOMAIN=https://ap-south-1xbchehaut.auth.ap-south-1.amazoncognito.com`.
- `COGNITO_REDIRECT_URI=https://main.d1r4w0u6vll4kh.amplifyapp.com/api/v1/customer/callback`.

In the Cognito console, choose **Managed login** branding for the user-pool domain, configure the app client for the authorization code grant and `openid`, `email`, and `profile` scopes, and allow PKCE. Add the exact callback URI above to the app client's callback URLs and `https://main.d1r4w0u6vll4kh.amplifyapp.com/` to its sign-out URLs. Cognito handles the customer identity and credentials; MySQL is still required for the app's saved carts and addresses. Apply `npm run migrate:customers` after MySQL is configured to enable those saved customer features.
## Data persistence and launch readiness

Amplify compute has ephemeral storage and only `/tmp` is writable. Do not use the local JSON preview store or local upload directory as durable production storage. Product, order, and inventory persistence still needs a production database; uploaded product images need durable object storage such as S3. These workflows must be connected before opening checkout to real customers.





