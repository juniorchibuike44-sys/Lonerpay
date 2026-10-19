# Gift cards and Nearby Places: provider findings and activation

19 October 2026. No new payment integration or provider account is activated by this release.

## What works now

Dashboard → Nearby Places → Hotels / Restaurants / Supermarkets → optional town/area → Find places on Google Maps. It opens an external Google Maps listing search in another tab or Maps app, keeping the LonerPay dashboard available. Leaving the area empty requests places near the customer's location as handled by Google Maps. LonerPay does not request device geolocation, collect coordinates, store area searches, proxy search requests or scrape listings. No Maps API key/billing account is needed for Google Maps URLs. No claim is made that a listing is a LonerPay partner or that it is the mathematically nearest result.

Listing photos, contact options, opening hours and directions are available where Google Maps has them. Customers confirm details directly with a business. LonerPay does not yet process hotel reservations, restaurant orders or supermarket purchases. This is discovery, not a booking/payment API.

The Gift Cards dashboard entry replaces the old alert-only mock function with an explicitly inactive gold information screen. It has no card-code/photo collection, price calculator, buy/sell submission, wallet debit, provider request or payout. Do not describe it as live trading.

## Gift-card provider: Prestmit

Prestmit explicitly documents both buying and selling through its partner API:
- https://prestmit.io/developers
- https://documentation.prestmit.io/docs/getting-started-api-keys-authentication
- https://documentation.prestmit.io/docs/buy-gift-card
- https://documentation.prestmit.io/docs/sell-gift-card

Their documentation requires creating an account at https://sandbox.prestmit.io and requesting API access. Use their official support/dashboard contact rather than a guessed email address. After approval, Developers credentials include API_KEY and API_SECRET; keep them in server environment settings, never HTML/browser storage or chat. Sandbox base https://dev-api.prestmit.io/partners/v1 ; live https://api.prestmit.io/partners/v1 . Authentication uses HMAC-SHA256 of API_KEY + ':' + JSON.stringify(request data), with API-KEY and API-Hash headers. POST attachment parameters are excluded from the signed body as documented. Confirm exact signing with provider test cases before integration.

Buying requires a funded provider wallet, calculate-payment quotes, create-order tracking, webhook handling and controlled access to delivered codes. Selling requires provider rates, secure card-code/image submission, provider verification, documented payout method and final confirmation. A submitted card is not a confirmed payout.

Before enabling customers:
1. Obtain approved sandbox access and written confirmation that LonerPay's business model and Nigeria operations are supported. Confirm fees, NGN settlement, commission/markup rules, KYC and dispute/refund requirements.
2. Integrate read-only provider catalogues and expiring quotes; show actual brand, region, denomination, currency and total naira amount. Never fabricate rates from the old mock brands.
3. Design an auditable idempotent order ledger and wallet reservation/debit/refund flow. Establish reconciliation before retrying unknown provider outcomes. Authenticate and deduplicate provider callbacks; do not trust browser success messages.
4. Store card codes/images only in protected storage with owner-only access and an approved retention/deletion policy. Redact codes from logs and ordinary support channels. Persist provider references and fees for profit accounting.
5. For sales, credit exactly once only after authoritative confirmed settlement. Do not re-enable outbound bank transfers. Payout channel and any customer-wallet credit must be agreed and tested first.
6. Test sandbox buy delivery, failed purchase, pending/retry, duplicate callback, rejected sell card, successful sell settlement, changed quote and code access isolation. Then use approved live credentials and a controlled real transaction before activation.

Reloadly documents gift-card purchasing at https://docs.reloadly.com/gift-cards . It is an alternative for buying; a consumer resale API was not verified in this review. Do not infer resale from their redeem-code endpoints.

## Nearby upgrade choices

Current Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started . Use api=1 and URL-encoded query. This release does not earn booking commissions.

For results inside LonerPay, Google Places API (New) needs a Google Cloud project, enabled API, restricted server-side credentials, billing/quota controls, a privacy update for location queries and compliance with attribution/data storage requirements:
- https://developers.google.com/maps/documentation/places/web-service/get-api-key
- https://developers.google.com/maps/documentation/places/web-service/nearby-search
- https://developers.google.com/maps/documentation/places/web-service/usage-and-billing

Hotel booking or restaurant/shop checkout needs a separate contracted booking/order provider or merchant integration that can confirm availability, pricing, inventory, payment, cancellation and fulfilment. Places search is not that integration. Research actual Nigeria coverage and commercial eligibility before selecting one.

## Validation

`node --test tests/discovery-features.test.mjs` (jsdom dependency required). Tests exercise the shipped script with the existing dashboard view-history controller: repeat open/back/reopen, entered-area URL encoding, category updates, near-me fallback, no automatic location/network calls, and no gift-card submission/payment flow. Live Maps ranking, merchant details and provider API approval are not tested by these mocks.
