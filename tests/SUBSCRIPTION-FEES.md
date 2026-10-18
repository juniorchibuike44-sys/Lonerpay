# Fee-inclusive subscription reconciliation

Run `supabase/business-subscription-fees.sql` after `business-subscriptions.sql`, then check the existing pending reference. Do not initialize another payment. The migration is repeatable and does not grant access on its own.

The price remains 100000 kobo (NGN 1000). Server verification requires a live successful Paystack transaction, a matching stored reference and ownership, NGN, and at least the plan price. A higher charge is accepted only when the Paystack requested amount equals the plan price and the difference is no larger than the processor fee; if requested_amount is absent, the amount after Paystack fees must exactly equal the plan price. Underpayments and unexplained excess remain blocked.

The V2 confirmation calls the existing idempotent monthly grant and records actual customer charge in the same PostgreSQL transaction. Repeated callback/webhook confirmations cannot add another month or another revenue entry. Existing exact-price confirmed payments are backfilled at 100000 kobo.

Admin reporting separates subscription sales, gross receipts, customer-added fees, recorded Paystack fees, actual refunds and known receipts after fees/refunds. These are not settled-profit figures. Customer history shows the actual charge and fee added. Refund handling supports the complete fee-inclusive charge and is idempotent.

Run `npm --prefix tests install` and `node --test tests/subscription-fees*.test.mjs tests/business-subscription*.test.mjs tests/billing-handoff.test.mjs`. Automated tests use isolated PostgreSQL and mocked provider requests, not the actual customer's charge. After SQL setup, Check payment re-verifies the original reference with Paystack to reconcile the live transaction.
