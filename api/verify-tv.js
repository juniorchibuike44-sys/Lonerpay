const allowedTvServices = new Set(["dstv", "gotv", "startimes"]);

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

  if (!allowedTvServices.has(serviceID)) {
    return res.status(400).json({ error: "Invalid TV provider" });
  }

  if (!/^\d{8,15}$/.test(billersCode)) {
    return res.status(400).json({ error: "Enter a valid smartcard number" });
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
      "https://sandbox.vtpass.com/api/merchant-verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": vtpassApiKey,
          "secret-key": vtpassSecretKey
        },
        body: JSON.stringify({ serviceID, billersCode })
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
          "Smartcard verification failed"
      });
    }

    const content = providerData.content || {};
    if (content.WrongBillersCode === true) {
      return res.status(422).json({ error: "Invalid smartcard number" });
    }

    return res.status(200).json({
      verified: true,
      customerName: content.Customer_Name || content.CustomerName || "Verified customer",
      customerNumber: content.Customer_Number || content.Smartcard_Number || billersCode,
      customerType: content.Customer_Type || serviceID.toUpperCase(),
      status: content.Status || "",
      currentBouquet: content.Current_Bouquet || "",
      dueDate: content.Due_Date || "",
      renewalAmount: Number(content.Renewal_Amount || 0) || 0
    });
  } catch (error) {
    return res.status(500).json({
      error: "Smartcard verification request failed",
      message: error.message
    });
  }
}
