import { enforceRateLimit, hardenResponse } from "./_security.js";
import { pairgateRequest } from "./_pairgate.js";

const NETWORKS = [
  { id: "mtn", name: "MTN" },
  { id: "airtel", name: "Airtel" },
  { id: "glo", name: "Glo" },
  { id: "9mobile", name: "9mobile" }
];

export default async function handler(req, res) {
  hardenResponse(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!enforceRateLimit(req, res, { key: "epin-options", limit: 30, windowMs: 60_000 })) return;
  res.setHeader("Cache-Control", "no-store");

  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return res.status(401).json({ error: "Login required" });
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey || !process.env.PAIRGATE_API_KEY) {
    return res.status(500).json({ error: "Server configuration is missing" });
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: secretKey, Authorization: authorization }
  });
  if (!userResponse.ok) return res.status(401).json({ error: "Invalid or expired login" });

  try {
    const provider = String(req.query?.provider || "mtn").trim().toLowerCase();
    if (provider && !NETWORKS.some(item => item.id === provider)) {
      return res.status(400).json({ error: "Invalid network" });
    }
    const suffix = `?provider_id=${encodeURIComponent(provider)}`;
    const result = await pairgateRequest(`/epin/denominations${suffix}`, { method: "GET" });
    const rows = Array.isArray(result.data?.data) ? result.data.data : [];
    const denominations = [...new Set(rows.map(row => Number(row?.denomination)).filter(value => Number.isInteger(value) && value > 0))].sort((a,b) => a-b);
    if (!result.response.ok || result.data?.status !== "success" || !denominations.length) {
      return res.status(502).json({ error: result.data?.message || "Recharge-card denominations are unavailable" });
    }
    return res.status(200).json({ networks: NETWORKS, denominations });
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({ error: error?.message || "Could not load recharge-card options" });
  }
}
