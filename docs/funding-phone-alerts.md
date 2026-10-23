# Wallet funding phone alerts

Successful Paystack wallet funding (Fund Wallet and dedicated virtual accounts) creates one inbox notice and push delivery job per subscribed device in the same database transaction as the wallet credit. Duplicate Paystack references cannot create duplicate notices. No historical transactions are backfilled.

The existing webhook drains queued jobs after crediting the wallet. A protected Vercel cron retries delivery every minute. Push service acceptance is recorded separately from device delivery; a phone can be offline or have notifications disabled. Expired subscriptions are removed, transient failures retry with backoff, and notifications expire after 24 hours. Stable notification tags and Web Push topics collapse retries.

## Device setup

On the signed-in dashboard, open Notifications and tap **Enable phone alerts**, then allow the browser permission. The permission prompt never opens automatically. The same inbox offers **Turn off phone alerts**. Compatible browsers and the current browser-based Android wrapper use Web Push; test an actual subscribed phone before claiming end-to-end delivery.

The service worker stores only the current account identifier, clears it on local session removal, and suppresses pushes for another account. Server registration derives ownership from Supabase authentication, never request metadata. Notification clicks load the matching successful funding receipt through the authenticated transactions endpoint.

## Server configuration

Production Vercel environment variables: PUSH_VAPID_PUBLIC_KEY (public), PUSH_VAPID_PRIVATE_KEY (secret), CRON_SECRET (secret). Existing Supabase backend credentials are reused. Private keys are never included in client files. No Firebase account is required.

Applied database changes: supabase/funding-alerts.sql and supabase/wallet-credit-backend-only.sql. New push tables intentionally deny all browser table access with RLS and revoked grants; the authenticated API enforces ownership. Wallet credit RPC execution is service_role-only.

## Verification

Database verification used a rolled-back transaction: credit 12.34, replay the same reference, verify one notice/job, correct owner/message, failed credit suppression, and no balance change retained. Unit/integration tests cover delivery retry/expiry, endpoint validation, credential checks, cross-account suppression, permission opt-in, opt-out, logout and authenticated receipt lookup. No real customer push was sent during automated tests.
