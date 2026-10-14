import { enforceRateLimit, hardenResponse } from "./_security.js";
import { pairgateMessage, pairgateRequest } from "./_pairgate.js";

const allowedTvServices = new Set(["dstv", "gotv", "startimes"]);

export default async function handler(req, res) {
  hardenResponse(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!enforceRateLimit(req, res, { key: "verify-tv", limit: 20, windowMs: 60_000 })) return;
  res.setHeader("Cache-Control", "no-store");

  const authorization = req.headers.authorization;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  const serviceID = String(req.body?.serviceID || req.body?.provider_id || "").trim().toLowerCase();
  const billersCode = String(req.body?.billersCode || req.body?.smartcard || "").trim();

  if (!allowedTvServices.has(serviceID)) return res.status(400).json({ error: "Invalid TV provider" });
  if (!/^\d{8,15}$/.test(billersCode)) return res.status(400).json({ error: "Enter a valid smartcard number" });
  if (!supabaseUrl || !supabaseSecretKey || !process.env.PAIRGATE_API_KEY) {
    return res.status(500).json({ error: "Server configuration is missing" });
  }
  if (!authorization?.startsWith("Bearer ")) return res.status(401).json({ error: "Login required" });

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseSecretKey, Authorization: authorization }
    });
    if (!userResponse.ok) return res.status(401).json({ error: "Invalid or expired login" });

    const verification = await pairgateRequest("/cable/verify", {
      method: "POST",
      body: JSON.stringify({ provider_id: serviceID, smartcard: billersCode })
    });
    const verified = verification.response.ok && verification.data?.status === "success" &&
      verification.data?.data?.status === true;
    if (!verified) {
      return res.status(422).json({ error: pairgateMessage(verification.data, "Smartcard verification failed") });
    }

    return res.status(200).json({
      verified: true,
      customerName: String(verification.data?.data?.customer_name || "Verified customer"),
      customerNumber: billersCode,
      customerType: serviceID.toUpperCase(),
      status: "Active",
      currentBouquet: "",
      provider: "pairgate"
    });
  } catch (error) {
    return res.status(Number(error?.statusCode) || 500).json({
      error: error?.message || "Smartcard verification request failed"
    });
  }
}
