# AWS Amplify deployment

The storefront and API run in one Node.js server. Amplify must publish the server compute bundle, not treat the GoDaddy preview ZIP as a static site.

## Build and artifact settings

The root `amplify.yml` installs dependencies, runs `npm run build`, and publishes `.amplify-hosting/`. The build keeps the GoDaddy ZIP and also creates the Amplify deployment manifest and self-contained Node.js 22 compute bundle.

The Amplify compute server listens on the `PORT` supplied by the platform (Amplify compute uses port 3000). The bundle routes requests through the server, which serves both the storefront files and API. Its entrypoint explicitly selects the sandbox preview mode and places preview data in `/tmp/agroseed`, because Amplify compute does not allow writes beside the deployed application files.

## Amplify app environment

This Amplify bundle is a public staging preview, not a production store. The entrypoint sets `NODE_ENV=development`, `AGROSEED_DEMO_MODE=true`, and `AGROSEED_STORAGE_DIR=/tmp/agroseed` in the compute process. Do not set `PORT`; Amplify supplies it. The preview filesystem is temporary, so products, settings, and preview orders can disappear or differ between compute instances.

## Cognito Managed Login

The storefront sends `/account/login` directly to Cognito Managed Login; there is no separate in-store sign-in form. Cognito hosts sign-in, sign-up, and account recovery. After authorization, Cognito returns to the Node callback, the server exchanges the authorization code with PKCE, validates the ID token, and stores the session in HttpOnly cookies. Successful sign-in returns the customer to `/`.

Set these non-secret environment variables in Amplify build settings (the package script carries them into the compute bundle):

- `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID`.
- `COGNITO_DOMAIN=https://ap-south-1xbchehaut.auth.ap-south-1.amazoncognito.com`.
- `COGNITO_REDIRECT_URI=https://main.d1r4w0u6vll4kh.amplifyapp.com/api/v1/customer/callback`.
- `COGNITO_CLIENT_SECRET_ARN`, only if the configured app client has a secret. Store the secret value in AWS Secrets Manager as a plain-text `SecretString`; configure only its ARN as this Amplify environment variable. The compute runtime fetches the secret at startup using its IAM role. The secret value is never embedded in Git or the deployment bundle.

### Allow the Amplify runtime to read the Cognito client secret

If the Cognito app client has a secret, create an AWS Secrets Manager secret in `ap-south-1` containing only the Cognito client secret as its `SecretString`. Copy the complete secret ARN and set `COGNITO_CLIENT_SECRET_ARN` in **Amplify → Hosting → Environment variables**. Do not set the secret value itself as an Amplify environment variable.

Create this IAM policy, replacing the resource with the complete ARN of your secret:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:ap-south-1:123456789012:secret:agroseed/cognito-client-secret-abc123"
    }
  ]
}
```

Attach it to an IAM role whose trust policy allows `sts:AssumeRole` from `amplify.amazonaws.com`, then select that role in **Amplify → App settings → IAM roles → Compute role** for the `main` branch. This SSR compute role provides temporary AWS credentials to the server at runtime. Save the role and trigger a new deployment. The server fails closed at startup if it cannot retrieve the configured secret. See [Adding an SSR Compute role](https://docs.aws.amazon.com/amplify/latest/userguide/amplify-SSR-compute-role.html).

In the Cognito console, choose **Managed login** branding for the user-pool domain and configure the app client for the authorization code grant with PKCE. The app requests only the required `openid` scope, so it does not depend on optional `email` or `profile` scopes being enabled. Cognito includes all user attributes readable by the app client in the ID token for an `openid`-only request. Add the exact callback URI above to the app client's callback URLs and `https://main.d1r4w0u6vll4kh.amplifyapp.com/` to its sign-out URLs. Cognito handles the customer identity and credentials; MySQL is still required for the app's saved carts and addresses. Apply `npm run migrate:customers` after MySQL is configured to enable those saved customer features.

## Data persistence and launch readiness

Amplify compute has ephemeral storage and only `/tmp` is writable. Do not use the local JSON preview store or local upload directory as durable production storage. Product, order, and inventory persistence still needs a production database; uploaded product images need durable object storage such as S3. These workflows must be connected before opening checkout to real customers.





