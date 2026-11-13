# Monnify funding migration

Status: Monnify funding and an airtime purchase have been confirmed in the founder pilot. Primary dashboard funding can now be switched for that user with MONNIFY_PRIMARY=true. Customer-wide migration remains pending settlement, reversal/dispute handling and transition checks. No existing Paystack account, balance, checkout or webhook has been removed. The live funding test credited once and generated one funding notification; actual bank settlement and fees still need confirmation.

## Server configuration

Set secrets directly in the Vercel project `lonerpay_vercel_fixed`, never in chat or source files:

- `MONNIFY_API_KEY`: API Key from Developer > API Keys & Contracts.
- `MONNIFY_SECRET_KEY`: Secret Key from the same page (Vercel Secret).
- `MONNIFY_CONTRACT_CODE`: contract code, not business code or wallet number.
- `MONNIFY_MODE`: explicitly `live` or `sandbox`.
- `MONNIFY_ENABLED`: `true` to enable the restricted pilot after schema and credentials are ready; absent/false disables all new Monnify activity.
- `MONNIFY_PRIMARY`: `true` selects Monnify for eligible users in the configured rollout. Their dedicated-account API returns Monnify details, funding buttons open bank transfer funding, and new Paystack checkout/account creation is refused. Configuration failures do not silently fall back to the old provider. Leave absent/false for an additive pilot.
- `MONNIFY_ROLLOUT`: `pilot` (default). Do not change to `all` until customer cutover is complete and reviewed.
- `MONNIFY_PILOT_USER_ID`: the verified LonerPay account UUID for the founder. This restriction applies server-side to account creation and webhook crediting, not just to a hidden button.

Existing SUPABASE_URL and server-only SUPABASE_SECRET_KEY are reused. No new dependencies.

## Backend

- Apply `supabase/monnify-funding.sql` after tests and schema review. Additive tables and a service-role-only atomic credit function; no existing customer balances are changed.
- `/api/monnify-account`: authenticated GET/POST, rate limited. POST requires full_name, consent:true and an 11-digit bvn or nin. Uses a stable per-user/mode account reference and recovers that reference after ambiguous creation. Raw identity numbers and provider responses are never stored or returned.
- `/api/monnify-webhook`: raw-body HMAC-SHA512 verification, requery via Monnify API, strict NGN/PAID/reserved-account/amount/owner validation, atomic namespaced ledger receipt. Failure returns non-2xx so Monnify retries. Settlement notifications never credit customer balances.
- Sandbox is verification-only and cannot credit production wallets. Monnify's unsigned sandbox webhooks are rejected. Use signed synthetic notifications for local tests; do not relax the production signature requirement.
- Dashboard adds a separate Test Monnify funding button only for the eligible pilot user. With MONNIFY_PRIMARY=true, eligible users use the main Fund Wallet and Virtual Account actions; the extra test button disappears. Unmigrated customers retain their existing funding flow. Education and recharge-card purchases are rejected by secure-pay for migrated users because they fall outside the confirmed scope. The Monnify form checks API authentication before requesting identity details, clears the identity field on submit, and only displays server-confirmed bank details. Session changes close the form.
- Apply `supabase/monnify-funding-alerts.sql` to extend the existing wallet-credit notification trigger to both providers; the ledger insert and queued alert remain atomic and idempotent.
- Confirmed gross transfers are credited in full. Provider fees are a business expense. No customer funding fee is introduced by this implementation.

## Before customer cutover

1. Complete Monnify's requested business-code setup review. Save its written confirmation and keep restricted services disabled.
2. Configure credentials privately, deploy, and confirm access to reserved accounts. Test provider KYC rejection and duplicate-reference recovery against actual sandbox/live responses.
3. Complete customer cutover routing: replace Paystack account/checkout entry points only after a deliberate provider switch. The primary Monnify flow is currently restricted to the founder. Paystack receipts, historical accounts and webhook processing remain for late payments; account history is not deleted.
4. Add required advance-payment terms (VTU/utilities only, no interest, no transfers/withdrawals); review education, subscriptions and other paid features against the approved scope. Do not enable them on Monnify by assumption.
5. Verify the newly extended funding-notification trigger and actual push delivery on the founder's test device.
6. Implement and test reversal/dispute reconciliation and operator alerts before general launch. This stage ignores non-success events, and never credits them; it does not automatically reverse previously spent funds.
7. Make a small authorised real transfer and verify one matching credit, correct fees, actual settlement, duplicate/replayed delivery, API/DB outage recovery, provider balance sufficient for immediate bill fulfilment, and account ownership isolation.
8. Reconcile old wallet liabilities, Paystack pending collections and settlement cash. Customer account numbers will change. Retain legacy references/webhooks and a late-transfer support procedure until old accounts are formally retired. Never delete history or credit migrated balances a second time.
9. Only then retire Paystack funding/checkout, update customer messaging and monitor both providers through the transition.

Intended Transaction completion URL after deployment/configuration: `https://lonerpay.com/api/monnify-webhook`. Do not save it in Monnify until deployment is verified; it returns 503 until configured.

References: https://developers.monnify.com/docs/webhooks ; https://developers.monnify.com/docs/collections/manage-payments/verify-transactions ; https://developers.monnify.com/docs/collections/recurring-payments/reserved-accounts
