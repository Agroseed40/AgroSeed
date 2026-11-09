# Supabase customer sign-in and account storage

The customer-auth module can use Supabase Auth and PostgreSQL for customer profiles, saved carts, and addresses. The existing Cognito/MySQL path remains the default until `CUSTOMER_AUTH_PROVIDER=supabase` is set.

## Supabase project setup

1. In **Authentication → Sign In / Providers**, enable **Phone**. Configure an SMS provider in the Supabase Auth settings. Supabase Auth creates and verifies OTPs, but the SMS provider delivers them.
2. In **SQL Editor**, run [`../supabase/migrations/20261109000000_customer_accounts.sql`](../supabase/migrations/20261109000000_customer_accounts.sql). The migration creates customer tables, row-level security policies, and the cart/address RPC functions.
3. In the Amplify app's server environment variables, set:

   - `CUSTOMER_AUTH_PROVIDER=supabase`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`

   `SUPABASE_JWKS_URL` is optional; `@supabase/server` derives the JWKS endpoint from the project URL. The customer routes use the caller's verified JWT and RLS. They do not need the Supabase secret key.

4. Redeploy the Amplify app and request an OTP for a phone number you control. A successful request means the OTP was accepted for delivery; ownership is confirmed only after the customer submits the code.

Keep any Supabase secret key server-only. Do not put it in browser JavaScript, Git, or `.env.example`. The secret key previously pasted into chat should be rotated before use.

## Current scope

This switches customer sign-in and the customer profile, saved-cart, and address tables. Catalog, inventory, preview orders, and admin data remain on the existing preview storage path and are not migrated by this SQL file. Existing Cognito accounts are not imported automatically.
