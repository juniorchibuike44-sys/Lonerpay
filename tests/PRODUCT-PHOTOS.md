# Product photo checks

Run `npm --prefix tests install`, then `node --test tests/product-photos*.test.mjs tests/business-growth*.test.mjs` (Node 22.12 or newer).

Run `supabase/business-product-photos.sql` after the existing Business Tools migrations. The repeatable migration adds one nullable image path and a private Storage bucket, without changing existing products or invoices.

Phone checks: edit a product; select a gallery photo; confirm preview; save; refresh; open the published catalogue and enlarge the image; replace the photo; remove it; unpublish the product/store and confirm the image endpoint no longer serves it. Test a slow upload retry and verify that the original product and stock remain intact.

The browser resizes images to a maximum dimension of 1400px, converts them to JPEG and uploads at most 2 MB. Source JPG, PNG and WebP images up to 15 MB are supported. Private owner previews use one-hour signed URLs. Public image requests check both product and store publication on every request and do not cache the response. Images already downloaded by a customer cannot be recalled.

Automated coverage uses isolated PostgreSQL/PGlite, mocked storage HTTP requests and jsdom interactions. It does not contact production Storage or upload customer images. Real phone/gallery and production Storage checks follow SQL setup.
