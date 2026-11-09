# Supabase customer sign-in and account storage

The customer-auth module uses Supabase Auth and PostgreSQL for customer email sign-in, profiles, saved carts, and addresses. Cognito/MySQL remains available as an alternate backend, but the storefront email login requires `CUSTOMER_AUTH_PROVIDER=supabase`.

## Supabase project setup

1. In **Authentication → Sign In / Providers**, leave **Email** enabled. Under **Authentication → Email Templates → Magic Link**, make the template include `{{ .Token }}` so Supabase sends a code instead of a sign-in link. Supabase creates and verifies the code, then sends it by email. Its built-in sender is limited; configure custom SMTP in **Project Settings → Authentication → SMTP Settings** before using customer addresses in production.
2. In **SQL Editor**, run [`../supabase/migrations/20261109000000_customer_accounts.sql`](../supabase/migrations/20261109000000_customer_accounts.sql). The migration creates customer tables, row-level security policies, and the cart/address RPC functions.
3. In the Amplify app's environment variables, set:

   - `CUSTOMER_AUTH_PROVIDER=supabase` (replace any existing `cognito` value)
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`

   `SUPABASE_JWKS_URL` is optional; `@supabase/server` derives the JWKS endpoint from the project URL. The customer routes use the caller's verified JWT and RLS. They do not need the Supabase secret key.

   The Amplify packaging step copies the provider, project URL, and publishable key into the generated Node compute entrypoint so the running server can read them. Redeploy after changing these variables.

4. Request an OTP for an email address you control. A successful request means the OTP was accepted for delivery; ownership is confirmed only after the customer submits the code. If Supabase's built-in sender only accepts a project-team email, configure SMTP before testing with another address.

Keep any Supabase secret key server-only. Do not put it in browser JavaScript, Git, or `.env.example`. The secret key previously pasted into chat should be rotated before use.

## Current scope

This switches customer sign-in and the customer profile, saved-cart, and address tables. Catalog, inventory, preview orders, and admin data remain on the existing preview storage path and are not migrated by this SQL file. Existing Cognito accounts are not imported automatically.
