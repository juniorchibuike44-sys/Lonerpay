# Business Tools checks

Run `npm --prefix tests install`, then `npm --prefix tests run test:business-growth` (Node 22.12 or newer).

The tests use an isolated PostgreSQL instance in PGlite and simulated DOM interactions in jsdom. They do not contact production or move money.

Deploy `supabase/business-growth.sql` through the project's SQL Editor after the existing `business-tools.sql` setup. The migration is repeatable and preserves existing invoices. New tools show a setup message until it runs.

Manual phone checks after SQL setup: open Business Tools; create a product; add/remove stock; edit its catalogue flag; save and publish store settings; open the public link signed out; send a test order to your own WhatsApp; unpublish the store and confirm its public link stops opening; view a dated report and download its CSV. Check Back/reopen between all six cards.

Sales reports describe issued invoices and merchant-recorded payments, not wallet settlement or profit. Stock changes are manual. WhatsApp orders do not reserve stock, create invoices, deduct inventory or take payment.
