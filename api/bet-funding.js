import { pbkdf2Sync, timingSafeEqual } from "crypto"; 
function verifyStoredPin(pin, storedHash) {
  try {
    const [algorithm, iterationsText, salt, expectedHex] =
      String(storedHash || "").split("$");

    if (algorithm !== "pbkdf2_sha256") return false;

    const iterations = Number(iterationsText);
    if (!Number.isSafeInteger(iterations) || iterations <= 0) return false;

    const actual = pbkdf2Sync(
      String(pin),
      salt,
      iterations,
      32,
      "sha256"
    );

    const expected = Buffer.from(expectedHex, "hex");

    return (
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
} 
async function callRpc(name, params) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase configuration is missing");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(params)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Wallet operation failed");
  }

  return Array.isArray(data) ? data[0] : data; 
} 
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }
let debitCompleted = false; 
  let user = null;
let reference = null;
let pairgateReference = null;
  let pairgateSubmitted = false; 
  try {
    const { provider_id, amount, customer_id, recipient_name, pin, request_id } = req.body || {};
    const normalizedProvider = String(provider_id || "").trim().toLowerCase();

   if (!normalizedProvider || !amount || !customer_id || !pin || !request_id) {
      return res.status(400).json({
        success: false,
        message: "Provider, amount and customer ID are required"
      });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < 50) {
      return res.status(400).json({
        success: false,
        message: "Minimum betting funding amount is ₦50"
      });
    }
const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const authorization = req.headers.authorization;

if (!supabaseUrl || !secretKey) {
  return res.status(500).json({
    success: false,
    message: "Server authentication configuration is missing"
  });
}

if (!authorization?.startsWith("Bearer ")) {
  return res.status(401).json({
    success: false,
    message: "Login required"
  });
} 
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
    success: false,
    message: "Invalid or expired login"
  });
}

 user = await userResponse.json(); 
const pinResponse = await fetch(
  `${supabaseUrl}/rest/v1/payment_pins?user_id=eq.${encodeURIComponent(user.id)}&select=pin_hash&limit=1`,
  {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`
    },
    cache: "no-store"
  }
);

if (!pinResponse.ok) {
  return res.status(500).json({
    success: false,
    message: "Unable to verify payment PIN"
  });
}

const pinRows = await pinResponse.json();
const storedPinHash = pinRows?.[0]?.pin_hash;

if (!storedPinHash || !verifyStoredPin(String(pin), storedPinHash)) {
  return res.status(401).json({
    success: false,
    message: "Invalid payment PIN"
  });
} 
    
    const apiKey = process.env.PAIRGATE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Pairgate API key is not configured"
      });
    }

reference = String(request_id).trim();

if (reference.length < 8 || reference.length > 100) {
  return res.status(400).json({ success: false, message: "Invalid transaction reference" });
}

// Never debit for a provider that Pairgate does not currently advertise.
const providersResponse = await fetch("https://pairgate.com/api/v1/providers/bet", {
  headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }
});
const providersData = await providersResponse.json().catch(() => ({}));
const availableProviders = Array.isArray(providersData?.data) ? providersData.data : [];
if (!providersResponse.ok || providersData?.status !== "success") {
  return res.status(503).json({ success: false, message: "Betting providers are temporarily unavailable. Your wallet was not debited." });
}
if (!availableProviders.some(item => String(item?.slug || "").toLowerCase() === normalizedProvider)) {
  return res.status(422).json({ success: false, message: "This betting platform is not currently supported. Your wallet was not debited." });
}
    
const debit = await callRpc("debit_wallet", {
  p_user_id: user.id,
  p_amount: numericAmount,
  p_request_id: reference,
  p_service: "bet-funding",
  p_details: {
    provider_id: normalizedProvider,
    customer_id: String(customer_id),
    recipient_name: recipient_name || ""
  }
});

if (!debit?.success) {
  return res.status(402).json({
    success: false,
    message: debit?.message || "Wallet debit failed",
    balance: Number(debit?.new_balance || 0)
  });
}

debitCompleted = true; 
    // Pairgate live betting wallet funding endpoint. 
    const response = await fetch(
      "https://pairgate.com/api/v1/bet/purchase", 
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          provider_id: normalizedProvider,
          amount: numericAmount,
          customer_id: String(customer_id),
          recipient_name: recipient_name || "LonerPay Customer",
          reference
        })
      }
    );

    const data = await response.json().catch(() => ({}));
    pairgateSubmitted = response.ok && data?.status === "success" && data?.data?.status === true;

    if (!pairgateSubmitted) {
      if (debitCompleted) {
  await callRpc("refund_wallet", {
    p_user_id: user.id,
    p_request_id: reference,
    p_reason: data.message || "Bet funding failed"
  });
  debitCompleted = false;
      } 
      return res.status(response.status || 400).json({
        success: false,
        message: data.message || "Bet funding request failed",
        pairgate: data
      });
    }

   pairgateReference = data.data?.reference_code || data.reference_code;
    if (!pairgateReference) {
  throw new Error("Pairgate reference code missing");
    } 
    const statusResponse = await fetch(
  `https://pairgate.com/api/v1/transaction/status?reference_code=${encodeURIComponent(pairgateReference)}`,
  {
    method: "GET",
    headers: {
    Authorization: `Bearer ${apiKey}`, 
      Accept: "application/json"
    }
  }
);

const statusData = await statusResponse.json().catch(() => ({}));
    console.log("Pairgate status response:", JSON.stringify(statusData)); 
    if (!statusResponse.ok) {
      return res.status(202).json({
        success: false,
        pending: true,
        message: "Bet funding was submitted and is awaiting confirmation",
        reference,
        pairgate_reference: pairgateReference
      });
    } 
    console.log("FULL Pairgate Response:", JSON.stringify(statusData, null, 2));
const rawStatus = statusData.data?.status || statusData.data?.data?.status;
let  finalStatus = (rawStatus || '').toString().toLowerCase().trim();
console.log("Extracted finalStatus:", finalStatus, "rawStatus:", rawStatus); 
console.log("Pairgate finalStatus normalized:", finalStatus, "raw:", statusData);

if (finalStatus === "failed" || finalStatus === "failure") {
  await callRpc("refund_wallet", {
    p_user_id: user.id,
    p_request_id: reference,
    p_reason: "Pairgate transaction failed"
  });
  debitCompleted = false;
  return res.status(400).json({
    success: false,
    message: "Bet funding failed. Money refunded",
    reference,
    pairgate_reference: pairgateReference
  });
}

if (finalStatus === "processing" || finalStatus === "pending" || finalStatus === "queued") {
  // Give Pairgate a few seconds to finish, then check again.
  await new Promise(resolve => setTimeout(resolve, 3000));

  const retryResponse = await fetch(
    `https://pairgate.com/api/v1/transaction/status?reference_code=${encodeURIComponent(pairgateReference)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    }
  );

  if (retryResponse.ok) {
    const retryData = await retryResponse.json();
    const retryRawStatus =
      retryData.data?.status ||
      retryData.data?.data?.status ||
      retryData.status ||
      "";

    finalStatus = String(retryRawStatus).toLowerCase().trim();
  }

  if (finalStatus === "processing" || finalStatus === "pending" || finalStatus === "queued") {
    return res.status(202).json({
      success: false,
      pending: true,
      message: "Bet funding is still processing",
      reference,
      pairgate_reference: pairgateReference
    });
  }
} 

// Accept ANY success variant - this fixes your bug
if (finalStatus === "successful" || finalStatus === "success" || finalStatus === "completed" || finalStatus === "paid" || finalStatus === "approved") {
  return res.status(200).json({
    success: true,
    message: "Bet funding successful",
    reference,
    pairgate_reference: pairgateReference,
    data: data.data
  });
}

// A submitted transaction with an unfamiliar or empty state must remain pending.
// Treating it as failed can show the wrong result after the betting wallet was credited.
return res.status(202).json({
  success: false,
  pending: true,
  message: "Bet funding was submitted and is awaiting final confirmation",
  reference,
  pairgate_reference: pairgateReference
});

  } catch (error) {
    console.error("Bet funding error:", error);
if (debitCompleted && !pairgateSubmitted) { 
  try {
    await callRpc("refund_wallet", {
      p_user_id: user.id,
      p_request_id: reference,
      p_reason: error?.message || "Bet funding request failed"
    });
    debitCompleted = false;
  } catch (refundError) {
    console.error("Bet funding refund error:", refundError);
  }
}
if (debitCompleted && pairgateSubmitted) {
  return res.status(202).json({
    success: false,
    pending: true,
    message: "Bet funding was submitted and is awaiting final confirmation",
    reference,
    pairgate_reference: pairgateReference
  });
}
    return res.status(500).json({
      success: false,
      message: "Unable to process bet funding"
    });
  }
} 
