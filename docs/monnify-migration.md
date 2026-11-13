# Monnify funding migration

Status: backend staged, disabled by default. No existing Paystack account, balance, checkout or webhook has been removed. No live Monnify payment has been tested.

## Server configuration

Set secrets directly in the Vercel project `lonerpay_vercel_fixed`, never in chat or source files:

- `MONNIFY_API_KEY`: API Key from Developer > API Keys & Contracts.
- `MONNIFY_SECRET_KEY`: Secret Key from the same page (Vercel Secret).
- `MONNIFY_CONTRACT_CODE`: contract code, not business code or wallet number.
- `MONNIFY_MODE`: explicitly `live` or `sandbox`.
- `MONNIFY_ENABLED`: leave absent/false until schema and credentials are ready.

Existing SUPABASE_URL and server-only SUPABASE_SECRET_KEY are reused. No new dependencies.

## Backend

- Apply `supabase/monnify-funding.sql` after tests and schema review. Additive tables and a service-role-only atomic credit function; no existing customer balances are changed.
- `/api/monnify-account`: authenticated GET/POST, rate limited. POST requires full_name, consent:true and an 11-digit bvn or nin. Uses a stable per-user/mode account reference and recovers that reference after ambiguous creation. Raw identity numbers and provider responses are never stored or returned.
- `/api/monnify-webhook`: raw-body HMAC-SHA512 verification, requery via Monnify API, strict NGN/PAID/reserved-account/amount/owner validation, atomic namespaced ledger receipt. Failure returns non-2xx so Monnify retries. Settlement notifications never credit customer balances.
- Sandbox is verification-only and cannot credit production wallets. Monnify's unsigned sandbox webhooks are rejected. Use signed synthetic notifications for local tests; do not relax the production signature requirement.
- Confirmed gross transfers are credited in full. Provider fees are a business expense. No customer funding fee is introduced by this implementation.

## Before customer cutover

1. Complete Monnify's requested business-code setup review. Save its written confirmation and keep restricted services disabled.
2. Configure credentials privately, deploy, and confirm access to reserved accounts. Test provider KYC rejection and duplicate-reference recovery against actual sandbox/live responses.
3. Complete front-end routing: show Monnify accounts instead of Paystack only after a deliberate provider switch; replace card checkout separately or explicitly retire that funding channel. No UI provider switch is enabled in this stage.
4. Add required advance-payment terms (VTU/utilities only, no interest, no transfers/withdrawals); review education, subscriptions and other paid features against the approved scope. Do not enable them on Monnify by assumption.
5. Extend funding-notification trigger for `monnify_wallet_funding` and test delivery. Existing trigger recognises Paystack only.
6. Implement and test reversal/dispute reconciliation and operator alerts before general launch. This stage ignores non-success events, and never credits them; it does not automatically reverse previously spent funds.
7. Make a small authorised real transfer and verify one matching credit, correct fees, actual settlement, duplicate/replayed delivery, API/DB outage recovery, provider balance sufficient for immediate bill fulfilment, and account ownership isolation.
8. Reconcile old wallet liabilities, Paystack pending collections and settlement cash. Customer account numbers will change. Retain legacy references/webhooks and a late-transfer support procedure until old accounts are formally retired. Never delete history or credit migrated balances a second time.
9. Only then retire Paystack funding/checkout, update customer messaging and monitor both providers through the transition.

Intended Transaction completion URL after deployment/configuration: `https://lonerpay.com/api/monnify-webhook`. Do not save it in Monnify until deployment is verified; it returns 503 until configured.

References: https://developers.monnify.com/docs/webhooks ; https://developers.monnify.com/docs/collections/manage-payments/verify-transactions ; https://developers.monnify.com/docs/collections/recurring-payments/reserved-accounts
