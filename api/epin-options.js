import { enforceSharedRateLimit, hardenResponse } from "./_security.js";
import { pairgateRequest, pairgateEpinDenominations } from "./_pairgate.js";

const NETWORKS = [
  { id: "mtn", name: "MTN" },
  { id: "airtel", name: "Airtel" },
  { id: "glo", name: "Glo" },
  { id: "9mobile", name: "9mobile" }
];

export default async function handler(req, res) {
  hardenResponse(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!await enforceSharedRateLimit(req, res, { key: "epin-options", limit: 30, windowMs: 60_000 })) return;
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
    const result = await pairgateRequest(`/recharge-pins/denominations${suffix}`, { method: "GET" });
    const rows = Array.isArray(result.data?.data) ? result.data.data : [];
    const denominations = pairgateEpinDenominations(result.data, provider);
    if (!result.response.ok || result.data?.status !== "success" || !denominations.length) {
      const reason = !result.response.ok
        ? `Provider returned HTTP ${result.response.status}`
        : result.data?.status !== "success"
          ? "Provider did not confirm success"
          : rows.length ? "Provider returned card values in an unexpected format" : "Provider returned no card values";
      console.error("Pairgate recharge-card options unavailable", {
        httpStatus: result.response.status,
        providerStatus: result.data?.status,
        responseKeys: Object.keys(result.data || {}),
        dataIsArray: Array.isArray(result.data?.data),
        dataKeys: result.data?.data && typeof result.data.data === "object" && !Array.isArray(result.data.data)
          ? Object.keys(result.data.data) : [],
        rowCount: rows.length,
        firstRowKeys: rows[0] && typeof rows[0] === "object" ? Object.keys(rows[0]) : [],
        network: provider
      });
      return res.status(502).json({ error: result.data?.message || `Recharge Cards: ${reason}. Please contact support.` });
    }
    return res.status(200).json({ networks: NETWORKS, denominations });
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({ error: error?.message || "Could not load recharge-card options" });
  }
}
