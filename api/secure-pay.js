function createRequestId() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return (
    values.year +
    values.month +
    values.day +
    values.hour +
    values.minute +
    String(Date.now()).slice(-6)
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  res.setHeader("Cache-Control", "no-store");

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const vtpassApiKey = process.env.VTPASS_API_KEY;
  const vtpassSecretKey = process.env.VTPASS_SECRET_KEY;
  const authorization = req.headers.authorization;

  if (
    !supabaseUrl ||
    !secretKey ||
    !vtpassApiKey ||
    !vtpassSecretKey
  ) {
    return res.status(500).json({
      error: "Server payment configuration is missing"
    });
  }

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Login required"
    });
  }

  const {
    serviceID,
    billersCode,
    variation_code,
    amount,
    phone,
    email
  } = req.body || {};

  const paymentAmount = Number(amount);

  if (
    !serviceID ||
    !billersCode ||
    !Number.isFinite(paymentAmount) ||
    paymentAmount <= 0
  ) {
    return res.status(400).json({
      error: "Invalid payment details"
    });
  }

  if (!/^[a-z0-9_-]+$/i.test(serviceID)) {
    return res.status(400).json({
      error: "Invalid service"
    });
  }

  let user;
  let requestId;
  let debitCompleted = false;

  async function callRpc(functionName, body) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/${functionName}`,
      {
        method: "POST",
        headers: {
          apikey: secretKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text };
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
        data?.error ||
        `${functionName} failed`
      );
    }

    return Array.isArray(data) ? data[0] : data;
  }

  async function refundWallet(reason) {
    if (!debitCompleted || !user || !requestId) {
      return;
    }

    try {
      await callRpc("refund_wallet", {
        p_user_id: user.id,
        p_request_id: requestId,
        p_reason: reason
      });
    } catch (refundError) {
      console.error("WALLET REFUND ERROR:", refundError);
    }
  }

  try {
    const userResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: secretKey,
          Authorization: authorization
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Invalid or expired login"
      });
    }

    user = await userResponse.json();
    requestId = createRequestId();

    const debit = await callRpc("debit_wallet", {
      p_user_id: user.id,
      p_amount: paymentAmount,
      p_request_id: requestId,
      p_service: serviceID,
      p_details: {
        billersCode,
        variation_code: variation_code || "",
        phone: phone || "",
        email: email || ""
      }
    });

    if (!debit?.success) {
      return res.status(402).json({
        error: debit?.message || "Wallet debit failed",
        balance: Number(debit?.new_balance || 0)
      });
    }

    debitCompleted = true;

    const vtpassResponse = await fetch(
      "https://sandbox.vtpass.com/api/pay",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": vtpassApiKey,
          "secret-key": vtpassSecretKey
        },
        body: JSON.stringify({
          request_id: requestId,
          serviceID,
          billersCode,
          variation_code: variation_code || "",
          amount: paymentAmount,
          phone: phone || billersCode,
          email: email || "sandbox@sandbox.com"
        })
      }
    );

    const responseText = await vtpassResponse.text();
    let vtpassData;

    try {
      vtpassData = responseText
        ? JSON.parse(responseText)
        : {};
    } catch {
      vtpassData = {
        response_description: responseText
      };
    }

    const providerCode = String(vtpassData.code || "");
    const providerAccepted =
      vtpassResponse.ok &&
      (providerCode === "000" || providerCode === "099");

    if (!providerAccepted) {
      await refundWallet(
        vtpassData.response_description ||
        vtpassData.message ||
        "VTpass rejected the payment"
      );

      return res.status(502).json({
        error:
          vtpassData.response_description ||
          vtpassData.message ||
          "Provider payment failed",
        request_id: requestId,
        refunded: true
      });
    }

    return res.status(200).json({
      ...vtpassData,
      request_id: requestId,
      wallet: {
        balance: Number(debit.new_balance),
        transaction_id: debit.transaction_id
      }
    });
  } catch (error) {
    await refundWallet(error.message);

    return res.status(500).json({
      error: "Secure payment failed",
      message: error.message,
      request_id: requestId || null,
      refunded: debitCompleted
    });
  }
}
