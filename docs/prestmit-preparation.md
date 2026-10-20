# Prestmit gift-card preparation — 20 October 2026

Business review is pending. This release adds a clearly labelled interface preview and a read-only sandbox catalogue adapter. It does not activate purchases, sales, refunds or payouts.

## Available now

- Dashboard Gift Cards opens Buy cards, Sell cards and Orders sections using the existing overlay and Back behavior.
- Explicitly illustrative Amazon, Apple and Steam examples support search, region/currency display, value selection and purchase review. These are not provider inventory or advertised availability. No naira quote is fabricated.
- Orders explains that preview selections create no orders. Selling explains the future verification flow without collecting card codes, files, PINs or identity documents.
- GET /api/giftcards requires a valid LonerPay session. Default response is preview with checkoutEnabled=false. Every write method returns 405. No wallet or order API is called.
- Optional test catalogue access requires all of PRESTMIT_SANDBOX_CATALOGUE=true, PRESTMIT_SANDBOX_API_KEY and PRESTMIT_SANDBOX_API_SECRET in server environment variables. It reads only the documented sandbox /giftcard-trade/buy/config endpoint. Request signing is HMAC-SHA256 of API_KEY + ':' + JSON.stringify({}). Keys, raw payload, provider prices and issued card codes are never returned to the client. Unknown schemas return an unavailable response; confirm actual test payload once credentials arrive.

## Required after compliance approval

1. Confirm approved buy/sell scope, pricing, margins, funding, KYC and refund/payout terms in writing.
2. Validate sandbox authentication and catalogue schema using actual responses. Public documentation has differing examples; do not enable checkout based on example payloads.
3. Implement server-owned expiring quotes, approved margins, payment PIN checks and atomic order creation/debit with unique request IDs.
4. Implement verified provider submission, signed webhook verification, duplicate/replay protection and reconciliation. Timeouts stay pending until verified; a refund to the Prestmit wallet is not itself proof that the customer wallet was credited.
5. Add secure owner-only code delivery, real order history and refund tracking. Redact codes from logs and notifications.
6. Implement selling uploads/storage/retention and settlement only after exact provider requirements are confirmed. Test duplicate events, failures, out-of-stock and changed quotes, account isolation, refund retries and unknown outcomes.
7. Update disclosures and activate live trading only after end-to-end verification. No live provider URL is included in this preparation adapter.

## Official references

- https://documentation.prestmit.io/docs/getting-started-api-keys-authentication
- https://documentation.prestmit.io/reference/get_api-partners-v1-giftcard-trade-buy-config
- https://documentation.prestmit.io/docs/buy-gift-card-frequently-asked-questions
