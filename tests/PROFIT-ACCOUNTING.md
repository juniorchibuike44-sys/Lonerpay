Profit accounting validation

Run:

    node --test tests/profit-api.test.mjs tests/provider-accounting.test.mjs tests/profit-admin-ui.test.mjs
    node checkout-contract-test.mjs
    node requery-contract-test.mjs

The tests use mocked providers and PGlite PostgreSQL. They make no real purchases.

Deploy setup: run supabase/profit-accounting.sql once in the connected production Supabase project. It returns installed=profit-accounting-v1. The two service-only functions read review records and atomically merge verified provider-cost metadata. They never modify wallet balances, transaction amounts or statuses.

The admin review reconciles at most five missing-cost Pairgate purchases per click using the saved provider reference. Provider success, matching reference and available recipient must match before a cost can be recorded. It never initiates purchases or refunds. Missing references, unsupported providers and unconfirmed costs stay unknown. Existing different recorded costs are flagged rather than replaced. A future live purchase is still required to verify delivery and receipt on a real phone.

Reported profit is before operating expenses and wallet funding fees. Zero margins and losses are preserved; sales volume and deposits are not earnings.
