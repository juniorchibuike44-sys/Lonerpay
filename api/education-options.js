import { enforceRateLimit, hardenResponse } from "./_security.js";
import { pairgateMessage, pairgateRequest } from "./_pairgate.js";

const retailPrices = {
  waec: Number(process.env.LONERPAY_WAEC_PRICE || 5500),
  neco: Number(process.env.LONERPAY_NECO_PRICE || 2500),
  nabt: Number(process.env.LONERPAY_NABTEB_PRICE || 1500)
};

const labels = {
  waec: "WAEC Result Checker PIN",
  neco: "NECO Result Checker Token",
  nabt: "NABTEB Result Checker PIN"
};

export default async function handler(req, res) {
  hardenResponse(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!enforceRateLimit(req, res, { key: "education-options", limit: 30, windowMs: 60_000 })) return;
  res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=300");

  const authorization = req.headers.authorization;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey || !process.env.PAIRGATE_API_KEY) {
    return res.status(500).json({ error: "Server configuration is missing" });
  }
  if (!authorization?.startsWith("Bearer ")) return res.status(401).json({ error: "Login required" });

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseSecretKey, Authorization: authorization }
    });
    if (!userResponse.ok) return res.status(401).json({ error: "Invalid or expired login" });

    const result = await pairgateRequest("/providers/education", { method: "GET" });
    const providers = Array.isArray(result.data?.data) ? result.data.data : [];
    if (!result.response.ok || result.data?.status !== "success" || !providers.length) {
      return res.status(502).json({ error: pairgateMessage(result.data, "Could not load education services") });
    }

    const options = providers.map(item => {
      const slug = String(item?.slug || item?.id || "").trim().toLowerCase();
      return {
        code: slug,
        name: labels[slug] || String(item?.name || slug).toUpperCase(),
        amount: retailPrices[slug],
        providerName: String(item?.name || slug).toUpperCase()
      };
    }).filter(item => labels[item.code] && Number.isFinite(item.amount) && item.amount > 0);

    return res.status(200).json({ provider: "pairgate", options });
  } catch (error) {
    return res.status(Number(error?.statusCode) || 500).json({
      error: error?.message || "Education service request failed"
    });
  }
}
