import { enforceSharedRateLimit, hardenResponse } from "./_security.js";
import { pairgateMessage, pairgateRequest } from "./_pairgate.js";
import { electricityProviderId } from "./_electricity-providers.js";

const allowedProviders = new Set([
  "ikedc", "eko", "enugu", "yola", "benin", "ph",
  "aba", "aedc", "kaduna", "kedco", "ibedc", "jedc"
]);

export default async function handler(req, res) {
  hardenResponse(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!await enforceSharedRateLimit(req, res, { key: "verify-meter", limit: 20, windowMs: 60_000 })) return;
  res.setHeader("Cache-Control", "no-store");

  const authorization = req.headers.authorization;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  const providerId = electricityProviderId(req.body?.provider_id || req.body?.serviceID);
  const meterNumber = String(req.body?.meter_number || req.body?.billersCode || "").trim();
  const meterTypeText = String(req.body?.meter_type || req.body?.type || "").trim().toLowerCase();
  const meterType = meterTypeText === "prepaid" || meterTypeText === "1" ? 1
    : meterTypeText === "postpaid" || meterTypeText === "2" ? 2 : 0;

  if (!allowedProviders.has(providerId)) return res.status(400).json({ error: "Invalid electricity provider" });
  if (!/^\d{6,20}$/.test(meterNumber)) return res.status(400).json({ error: "Enter a valid meter number" });
  if (!meterType) return res.status(400).json({ error: "Invalid meter type" });
  if (!supabaseUrl || !supabaseSecretKey || !process.env.PAIRGATE_API_KEY) {
    return res.status(500).json({ error: "Server configuration is missing" });
  }
  if (!authorization?.startsWith("Bearer ")) return res.status(401).json({ error: "Login required" });

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseSecretKey, Authorization: authorization }
    });
    if (!userResponse.ok) return res.status(401).json({ error: "Invalid or expired login" });

    const verification = await pairgateRequest("/electricity/verify", {
      method: "POST",
      body: JSON.stringify({ provider_id: providerId, meter_number: meterNumber, meter_type: meterType })
    });
    const verified = verification.response.ok && verification.data?.status === "success" &&
      verification.data?.data?.status === true;
    if (!verified) {
      return res.status(422).json({ error: pairgateMessage(verification.data, "Meter verification failed") });
    }

    return res.status(200).json({
      verified: true,
      customerName: String(verification.data?.data?.customer_name || "Verified customer"),
      address: String(verification.data?.data?.address || ""),
      meterNumber,
      meterType: meterType === 1 ? "prepaid" : "postpaid",
      minimumAmount: 1000,
      provider: "pairgate"
    });
  } catch (error) {
    return res.status(Number(error?.statusCode) || 500).json({
      error: error?.message || "Meter verification request failed"
    });
  }
}

