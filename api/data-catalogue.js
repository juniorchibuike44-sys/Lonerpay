import { readSavedDataCatalogues } from "./_saved-data.js";

// No authentication or live provider calls: every new customer receives the
// same saved retail catalogue. Checkout still validates prices server-side.
export default async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  try {
    const catalogues = await readSavedDataCatalogues();
    if (!Object.keys(catalogues).length) throw new Error("No saved bundles yet.");
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=86400, stale-if-error=604800");
    const json = JSON.stringify({catalogues}).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
    return res.status(200).send(`window.LonerPaySavedData=${json};`);
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).send("/* Saved bundles unavailable; use the authenticated fallback. */");
  }
}
