# Paid Business Tools

Run `supabase/business-subscriptions.sql` in Supabase SQL Editor after existing Business Tools setup. No new environment variables are needed: existing live `PAYSTACK_SECRET_KEY`, Supabase server credentials and `LONERPAY_ORIGIN` are used. Checkout returns to the validated requesting LonerPay origin; callback defaults to https://lonerpay.com/business-subscribe.html.

Install existing test dependencies with `npm --prefix tests install`. Run `node --test tests/business-subscription*.test.mjs`.

Plan: NGN 1,000 for one calendar month, no free tier and no automatic recurring charge. Customers enter card details or use the bank-transfer option on Paystack checkout. No PAN, CVV or reusable card authorization is stored by this feature. No manual static account payment or screenshot can activate access.

The subscription ledger is separate from wallet funding. `LPBIZ-` references are routed before wallet webhook handling and are rejected by wallet funding verification. Both callback verification and signed webhooks use the same atomic, idempotent confirmation RPC. Server-side gates protect invoices, inventory, reports, stores, photos and voice receipts; public catalogues are unavailable while the merchant's plan is inactive. Existing business data is retained.

CEO dashboard: Business Tools sales shows all-time gross payments, processed refunds, sales after refunds, this month's sales, recorded fees, active subscriptions and a paginated ledger. These are subscription sales, not merchant invoices or settled profit. Full processed refunds remove the refunded month's access; partial refunds reduce revenue but retain access.

After deployment and SQL setup, manually test one live payment from your own customer account: open Business Tools unpaid, accept price, complete Paystack checkout, verify access and admin sales, reload and confirm no duplicate month/revenue, check regular wallet funding separately, and test the bank-transfer option if enabled on the Paystack account. Automated tests do not make real charges. Monthly card auto-renewal is not implemented.
