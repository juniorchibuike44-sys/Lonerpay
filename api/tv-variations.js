import { enforceRateLimit, hardenResponse } from "./_security.js";
import { pairgateMessage, pairgateRequest } from "./_pairgate.js";

const allowedTvServices = new Set(["dstv", "gotv", "startimes"]);

export default async function handler(req, res) {
  hardenResponse(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!enforceRateLimit(req, res, { key: "tv-variations", limit: 30, windowMs: 60_000 })) return;
  res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=300");

  const serviceID = String(req.query?.serviceID || "").trim().toLowerCase();
  const authorization = req.headers.authorization;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!allowedTvServices.has(serviceID)) return res.status(400).json({ error: "Invalid TV provider" });
  if (!supabaseUrl || !supabaseSecretKey || !process.env.PAIRGATE_API_KEY) {
    return res.status(500).json({ error: "Server configuration is missing" });
  }
  if (!authorization?.startsWith("Bearer ")) return res.status(401).json({ error: "Login required" });

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseSecretKey, Authorization: authorization }
    });
    if (!userResponse.ok) return res.status(401).json({ error: "Invalid or expired login" });

    const result = await pairgateRequest(`/cable-plans?provider_id=${encodeURIComponent(serviceID)}`, { method: "GET" });
    const payload = result.data?.data;
    const plans = Array.isArray(payload)
      ? payload
      : Object.values(payload || {}).flatMap(value => Array.isArray(value) ? value : []);

    if (!result.response.ok || result.data?.status !== "success" || !plans.length) {
      return res.status(502).json({ error: pairgateMessage(result.data, "Could not load TV bouquets") });
    }

    const variations = plans
      .map(item => ({
        code: String(item?.plan_id || item?.id || ""),
        name: String(item?.name || item?.plan_name || "TV bouquet"),
        amount: Number(item?.price || item?.amount),
        fixedPrice: true
      }))
      .filter(item => item.code && Number.isFinite(item.amount) && item.amount > 0)
      .sort((a, b) => a.amount - b.amount);

    return res.status(200).json({ serviceID, serviceName: serviceID.toUpperCase(), variations });
  } catch (error) {
    return res.status(Number(error?.statusCode) || 500).json({
      error: error?.message || "TV bouquet request failed"
    });
  }
}
