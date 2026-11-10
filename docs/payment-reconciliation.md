# Payment reconciliation

Bill payments debit the wallet once and stay pending until provider delivery is confirmed. A timeout, malformed body, server error or duplicate response never triggers an automatic refund. Explicit authentication, validation or rate-limit rejection without a provider reference can refund the attempted debit. Confirmed provider failure refunds through the locked wallet RPC.

Apply `supabase/payment-reconciliation.sql` before releasing this code. It keeps Pairgate debits pending, rejects repeat debit requests, protects confirmed deliveries from refunds, and adds a server-only settlement function. It does not reclassify historical purchases or change existing balances.

Vercel invokes `/api/payment-reconcile` every minute with `CRON_SECRET`. Each run checks at most two pending purchases older than one minute, oldest checked first, with bounded provider requests. It never sends another purchase. Webhooks, customer requery and the worker share an atomic settlement function. Refunded and confirmed successful purchases are terminal; duplicate or conflicting later callbacks cannot settle them again. Utility checkout makes at most two immediate status checks before handing off to reconciliation.

Missing provider references are marked for review without assuming the LonerPay reference is a Pairgate reference. Open the owner dashboard at `/ceo.html`, then use **Pending payment review**. Match the original LonerPay request, recipient, amount and time in the provider's records. Enter the provider reference and a review note. The server checks its provider status before settling and records the owner ID and note. Provider support is required when no matching provider record can be recovered; elapsed time alone never proves failure or authorizes a refund.

The worker processes ordinary individual bill purchases. Bulk purchases retain their existing item lifecycle and refund RPC. Historical successful rows without provider confirmation are only rechecked through the existing customer data requery path; the scheduled worker does not rewrite historical successful purchases.

Validation: `node --test tests/payment-reconciliation*.test.mjs tests/utility-purchase-outcome.test.mjs tests/data-purchase-outcome.test.mjs tests/data-unconfirmed-requery.test.mjs tests/accounting-persistence.test.mjs tests/electricity-providers.test.mjs tests/profit-api.test.mjs`. These simulate provider outcomes and test the SQL with PGlite. They do not spend money or establish live provider delivery speed.
