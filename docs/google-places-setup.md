# In-app Nearby Places activation

This release prepares authenticated, read-only Google Places API (New) search and optional photo retrieval. It does not activate a Google Cloud project, incur provider requests without activation, or add bookings/orders/payments. The Maps URL fallback remains usable without a Places key.

## Owner setup

1. Open https://console.cloud.google.com/ and create/select a project for LonerPay. Enable a billing account and the **Places API (New)**. This is a paid API; review the current rates, configure API quotas and billing alerts before activation. Budget alerts alone are not hard spending caps. Search fields include ratings, opening hours, phone and website (Enterprise-tier fields); photos are separate billable requests. Configure low appropriate request quotas for searchText, searchNearby and photo media. App limits are supplemental, process-local limits and not a distributed spending guarantee.
2. Create an API key. Restrict the key's API access to Places API (New). This implementation calls Google only from the server. Do not apply a website-referrer restriction to a server key: it will reject these calls. Apply compatible server IP restrictions if the deployment has stable egress; default Vercel egress may not be fixed. Confirm a suitable restriction/egress setup with the host if needed. Do not embed the key in HTML, send it in chat or commit it to git.
3. In Vercel → LonerPay project → Settings → Environment Variables, add `GOOGLE_PLACES_API_KEY` to Production. Keep Preview separate/off unless intentionally enabled. Set `PLACES_ENABLED` to `true` only when billing, quota limits and key restrictions are ready. The key alone does not activate searches. Redeploy after changing environment variables.
4. Smoke-test on a signed-in phone: type Nnewi, Anambra → Find places → hotels/restaurants/supermarkets. Test Use my location → allow → Find places, denial/manual fallback, photo, opening hours, phone, website, directions and back/reopen. Search ranking/coverage and whether specific details exist depend on Google. Confirm actual costs in the Cloud project.
5. To stop provider requests, set `PLACES_ENABLED=false` and redeploy. Google Maps URL fallback stays usable. No SQL migration or wallet funding is needed for this read-only feature.

## Request contract and controls

- `GET /api/places` checks authentication and returns only `{enabled}`. It never exposes keys and makes no Google request.
- `POST /api/places` with `{action:'search',category:'hotel'|'restaurant'|'supermarket',area:'Nnewi, Anambra'}` uses Text Search, Nigeria-focused query, strict category filtering, max 8 results, Google relevance order.
- Alternatively pass `location:{latitude,longitude}` to use Nearby Search, distance ranking, 5,000 m radius and max 8 results. Coordinates must be finite numbers in geographic bounds. Distances shown are approximate straight-line distances, not travel distances.
- Search uses a fixed field mask, fixed Google URL and no redirects. Unknown methods/categories/coordinates are rejected. Auth plus per-IP and per-account limits precede provider use. GET/config checks are not billable. No background/prefetch search.
- Each available photo gets a signed, account-bound 10-minute ticket from a search response. `POST {action:'photo',ticket}` verifies signature, account and expiry, then requests maxWidthPx=640 with skipHttpRedirect=true. The returned image must be HTTPS on an approved Google image domain. No API key is returned or embedded in an image URL. Photos are loaded by explicit user click, not eagerly for every result.
- No persistent Google-content cache, localStorage catalogue or location history is created. Response Cache-Control is no-store. Search bodies/coordinates/provider content are not logged by this handler. Retained UI/history nodes are temporary display state. Results expire after ten minutes while open.
- Server and client validate outbound URLs, render provider text through textContent, and retain Google Maps and photo/provider attribution. The mobile list uses compact Google Maps text attribution (not recoloured to gold), permitted for constrained layouts. Photos include author/avatar/profile resources where returned and a source link. Reviews/AI summaries are not requested or displayed.
- Location permission is enabled only for self in Permissions-Policy. The app requests location only after a user action and disclosure. Phone location remains optional; no browser watchPosition is used.
- Wallet, checkout, booking, gift-card and transfer APIs are not called by this feature.

## Validation and production limits

Run `node --test tests/places-api.test.mjs tests/places-client.test.mjs` with jsdom available. These tests mock auth and Google. No real Google key or billing project is available to the assistant, so live place coverage, photos, provider quotas/key restrictions and on-device permissions still require owner testing after activation. This is not a hotel inventory/booking integration.

Official references checked 19 October 2026:
- https://developers.google.com/maps/documentation/places/web-service/get-api-key
- https://developers.google.com/maps/documentation/places/web-service/nearby-search
- https://developers.google.com/maps/documentation/places/web-service/text-search
- https://developers.google.com/maps/documentation/places/web-service/place-photos
- https://developers.google.com/maps/documentation/places/web-service/policies
- https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
