const allowedTvServices = new Set(["dstv", "gotv", "startimes"]);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  const serviceID = String(req.query?.serviceID || "");
  const authorization = req.headers.authorization;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  const vtpassApiKey = process.env.VTPASS_API_KEY;
  const vtpassSecretKey = process.env.VTPASS_SECRET_KEY;

  if (!allowedTvServices.has(serviceID)) {
    return res.status(400).json({ error: "Invalid TV provider" });
  }

  if (!supabaseUrl || !supabaseSecretKey || !vtpassApiKey || !vtpassSecretKey) {
    return res.status(500).json({ error: "Server configuration is missing" });
  }

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Login required" });
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseSecretKey, Authorization: authorization }
    });
    if (!userResponse.ok) {
      return res.status(401).json({ error: "Invalid or expired login" });
    }

    const providerResponse = await fetch(
      `https://sandbox.vtpass.com/api/service-variations?serviceID=${encodeURIComponent(serviceID)}`,
      {
        headers: {
          "api-key": vtpassApiKey,
          "secret-key": vtpassSecretKey,
          Accept: "application/json"
        }
      }
    );
    const providerData = await providerResponse.json();
    const variations = providerData?.content?.variations;

    if (!providerResponse.ok || !Array.isArray(variations)) {
      return res.status(502).json({
        error:
          providerData?.response_description ||
          providerData?.message ||
          "Could not load TV bouquets"
      });
    }

    return res.status(200).json({
      serviceID,
      serviceName: providerData.content.ServiceName || serviceID,
      variations: variations.map(item => ({
        code: item.variation_code,
        name: item.name,
        amount: Number(item.variation_amount),
        fixedPrice: String(item.fixedPrice || "").toLowerCase() === "yes"
      }))
    });
  } catch (error) {
    return res.status(500).json({
      error: "TV bouquet request failed",
      message: error.message
    });
  }
}
