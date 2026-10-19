# LonerPay account and data deletion operations

Implemented 19 October 2026. This is a manual fulfilment workflow, not an automatic erasure endpoint.

## Where requests arrive

- `POST /api/account-deletion`: public request, no sign-in or app installation. Validated email and confirmation are sent to support@lonerpay.com and lonerhublimited@gmail.com. No account lookup, fund movement or deletion. Success means SMTP accepted a notice; it is not proof of inbox delivery. An SMTP failure returns 503 and direct email alternatives remain on the page.
- Profile → Delete Account & Data → `POST /api/account-closure`: authenticated request saved in the user's existing `app_metadata.account_closure_request`, visible through the existing owner Users report. It also emails support. A failed email does not discard the saved request. Retries reuse the pending reference. Reasons are optional, and funds/pending transactions do not prevent requesting review.
- Direct email/telephone support are available for people who cannot access their registered email.

## Owner fulfilment procedure

1. Monitor both support mailboxes and the existing admin Users closure references. Log a case with its reference, receipt date, owner and current status. For a public request, independently verify ownership before any disclosure or destructive action; the supplied email alone is not proof. Never ask for a password, PIN or OTP in email or chat. Use a trusted account session or the established identity-verification process.
2. Acknowledge the request. Aim to complete a verified request within 30 days; explain any delay and next step. A reason for leaving is not required. Do not mark the case completed at acknowledgement.
3. Inspect current wallet funds, pending payments, subscription payments, outstanding disputes and provider references. Resolve money with the customer through an authorised, auditable support/provider process. Do not require unwanted purchases or reactivate the unavailable bank-transfer feature. Never delete/change financial rows to make a balance disappear.
4. Determine and record the retention basis, scope, expiry/review date and restricted access for each financial, KYC, fraud/security or dispute record that must remain. Confirm the applicable period with the company's legal/financial adviser and relevant provider; no universal statutory duration is invented in the public policy. Explain the actual exceptions and duration to the customer.
5. Remove published store access first. Inventory associated rows and storage objects before erasure: profile and authentication identity, login PIN/device approvals and passkeys, notification records, support information, virtual-account customer identifiers, Business Tools customers/invoices/payments/stock/store/products, product photos in the private `business-products` bucket, subscription/provider-linked records and relevant logs/backups. Restrict retained records to their documented purpose and delete or anonymise records that are no longer required. Request appropriate deletion from processors and record their responses or independent retention reasons. Explain copies already shared by the customer that are outside our control.
6. Revoke sessions and approved-device access. Remove authentication identity and non-required associated data using a reviewed procedure appropriate to the live schema. **Do not blindly delete an auth.users row:** some related tables cascade on deletion, including subscription payment records. Export only legally required retained records to an access-restricted archive and verify their integrity before any approved cleanup. A ban, freeze, `pending_review` flag, or Supabase soft-delete alone is not proof that all associated data has been erased. This release deliberately does not run destructive deletion or provide a bulk erase button.
7. Verify no public store/photo access remains; non-required data is removed; login and old sessions no longer work; retained funds/ledger records reconcile. Record who completed each step. Notify the customer of completion, what was retained, why and for how long. Keep only the minimal necessary restricted audit evidence and arrange expiry of retained records.

## Before claiming launch readiness

- A real support submission and a deletion test request must reach an inbox; SMTP mocks do not verify production credentials or delivery. The owner must confirm this. Avoid real customer erasure in a smoke test.
- Rehearse fulfilment on an explicitly designated disposable test account, with reviewed retention handling and no real funds. Confirm the schema-dependent cleanup before offering immediate automated deletion.
- Finalise and apply the category-by-category retention schedule and review the policy/terms with the company's responsible legal/privacy contact. Public policy pages describe the manual process; they are not proof of Play approval or regulatory authorisation.
- Complete Google Play Data safety and deletion declarations accurately. Public URLs: `/privacy.html`, `/terms.html`, `/delete-account.html`, `/contact.html`.
- Android project and signed AAB packaging are a separate remaining step; this change creates neither an APK nor AAB.

## Validation

`node --test tests/launch-readiness.test.mjs` (Node with jsdom and nodemailer available).

Tests mock auth/database/SMTP: public non-enumeration, validation/rate limit, mail failures, positive-balance and pending requests, saved metadata preservation, retries, authentication, support delivery acknowledgement, public links and profile script parsing, duplicate submit protection and safe text rendering.

References checked: Google Play User Data policy https://support.google.com/googleplay/android-developer/answer/10144311 and deletion guidance https://support.google.com/googleplay/android-developer/answer/13327111 ; NDPC rights https://ndpc.gov.ng/ .
