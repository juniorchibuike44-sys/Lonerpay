const allowedElectricityServices = new Set([
  "aba-electric",
  "abuja-electric",
  "benin-electric",
  "eko-electric",
  "enugu-electric",
  "ibadan-electric",
  "ikeja-electric",
  "jos-electric",
  "kaduna-electric",
  "kano-electric",
  "yola-electric"
]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  const authorization = req.headers.authorization;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  const vtpassApiKey = process.env.VTPASS_API_KEY;
  const vtpassSecretKey = process.env.VTPASS_SECRET_KEY;
  const serviceID = String(req.body?.serviceID || "");
  const billersCode = String(req.body?.billersCode || "").trim();
  const type = String(req.body?.type || "").toLowerCase();

  if (!allowedElectricityServices.has(serviceID)) {
    return res.status(400).json({ error: "Invalid electricity provider" });
  }

  if (!/^\d{6,15}$/.test(billersCode)) {
    return res.status(400).json({ error: "Enter a valid meter number" });
  }

  if (type !== "prepaid" && type !== "postpaid") {
    return res.status(400).json({ error: "Invalid meter type" });
  }

  if (!supabaseUrl || !supabaseSecretKey || !vtpassApiKey || !vtpassSecretKey) {
    return res.status(500).json({ error: "Server configuration is missing" });
  }

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Login required" });
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseSecretKey,
        Authorization: authorization
      }
    });

    if (!userResponse.ok) {
      return res.status(401).json({ error: "Invalid or expired login" });
    }

    const providerResponse = await fetch(
      "https://sandbox.vtpass.com/api/merchant-verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": vtpassApiKey,
          "secret-key": vtpassSecretKey
        },
        body: JSON.stringify({ serviceID, billersCode, type })
      }
    );

    const responseText = await providerResponse.text();
    let providerData;

    try {
      providerData = responseText ? JSON.parse(responseText) : {};
    } catch {
      providerData = { response_description: responseText };
    }

    if (!providerResponse.ok || String(providerData.code || "") !== "000") {
      return res.status(422).json({
        error:
          providerData.response_description ||
          providerData.message ||
          "Meter verification failed"
      });
    }

    const content = providerData.content || {};
    if (content.WrongBillersCode === true || content.Can_Vend === "no") {
      return res.status(422).json({ error: "This meter cannot be used for payment" });
    }

    return res.status(200).json({
      verified: true,
      customerName: content.Customer_Name || content.CustomerName || "Verified customer",
      address: content.Address || "",
      meterNumber:
        content.Meter_Number ||
        content.MeterNumber ||
        content.Account_Number ||
        billersCode,
      meterType: content.Meter_Type || type,
      minimumAmount: Number(
        content.Min_Purchase_Amount || content.Minimum_Amount || 0
      ) || 0
    });
  } catch (error) {
    return res.status(500).json({
      error: "Meter verification request failed",
      message: error.message
    });
  }
}
