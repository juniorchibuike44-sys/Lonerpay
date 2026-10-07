const definitiveFailureCodes = new Set([
  "010", "011", "012", "013", "015", "016", "017", "018",
  "032", "034", "035", "040", "083", "087", "091"
]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "no-store");

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const apiKey = process.env.VTPASS_API_KEY;
  const vtpassSecretKey = process.env.VTPASS_SECRET_KEY;
  const authorization = req.headers.authorization;
  const requestId = String(req.body?.request_id || "").trim();
  const baseUrl = String(
    process.env.VTPASS_BASE_URL ||
    (String(process.env.VTPASS_ENV || "").toLowerCase() === "live"
      ? "https://vtpass.com/api"
      : "https://sandbox.vtpass.com/api")
  ).replace(/\/+$/, "");

  if (!supabaseUrl || !secretKey || !apiKey || !vtpassSecretKey) {
    return res.status(500).json({ error: "Server payment configuration is missing" });
  }
  if (!authorization?.startsWith("Bearer ")) return res.status(401).json({ error: "Login required" });
  if (!/^\d{12}[A-Za-z0-9_-]*$/.test(requestId)) return res.status(400).json({ error: "Invalid request reference" });

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: secretKey, Authorization: authorization }
    });
    if (!userResponse.ok) return res.status(401).json({ error: "Invalid or expired login" });
    const user = await userResponse.json();
    const serviceHeaders = {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json"
    };

    const transactionResponse = await fetch(
      `${supabaseUrl}/rest/v1/wallet_transactions?user_id=eq.${encodeURIComponent(user.id)}&request_id=eq.${encodeURIComponent(requestId)}&select=request_id,status,service,details&limit=1`,
      { headers: serviceHeaders, cache: "no-store" }
    );
    const rows = await transactionResponse.json().catch(() => []);
    const transaction = Array.isArray(rows) ? rows[0] : null;
    if (!transactionResponse.ok || !transaction) return res.status(404).json({ error: "Transaction not found" });
    if (String(transaction.status).toLowerCase() !== "pending") {
      return res.status(200).json({ resolved: true, status: transaction.status });
    }

    const providerResponse = await fetch(`${baseUrl}/requery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
        "secret-key": vtpassSecretKey
      },
      body: JSON.stringify({ request_id: requestId })
    });
    const providerData = await providerResponse.json().catch(() => ({}));
    const code = String(providerData?.code || "");
    const providerStatus = String(providerData?.content?.transactions?.status || "").toLowerCase();

    if (providerResponse.ok && code === "000" && providerStatus === "delivered") {
      await fetch(
        `${supabaseUrl}/rest/v1/wallet_transactions?user_id=eq.${encodeURIComponent(user.id)}&request_id=eq.${encodeURIComponent(requestId)}`,
        {
          method: "PATCH",
          headers: { ...serviceHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({
            status: "successful",
            details: {
              ...(transaction.details || {}),
              provider: "vtpass",
              provider_code: code,
              provider_status: providerStatus,
              provider_reference: String(providerData?.requestId || ""),
              purchased_code: String(providerData?.purchased_code || "")
            },
            updated_at: new Date().toISOString()
          })
        }
      );
      return res.status(200).json({ resolved: true, status: "successful" });
    }

    if (definitiveFailureCodes.has(code)) {
      const refundResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/refund_wallet`, {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({
          p_user_id: user.id,
          p_request_id: requestId,
          p_reason: providerData?.response_description || providerData?.message || "VTpass transaction failed"
        })
      });
      const refund = await refundResponse.json().catch(() => null);
      if (!refundResponse.ok) return res.status(500).json({ error: "Transaction failed but refund confirmation is pending" });
      return res.status(200).json({ resolved: true, status: "refunded", refund });
    }

    return res.status(202).json({ resolved: false, status: "pending", code: code || "099" });
  } catch (error) {
    return res.status(500).json({ error: "Could not confirm transaction status", message: error.message });
  }
}
