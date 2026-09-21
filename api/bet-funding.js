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
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const { provider_id, amount, customer_id, recipient_name, pin } = req.body; 

   if (!provider_id || !amount || !customer_id || !pin) { 
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

const user = await userResponse.json(); 
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

    const reference =
      "lonerbet-" + Date.now() + "-" +
      Math.random().toString(36).slice(2, 8);

    // TEST endpoint first — no real Pairgate balance is deducted.
    const response = await fetch(
      "https://pairgate.com/api/v1/test/bet/purchase",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          provider_id,
          amount: numericAmount,
          customer_id: String(customer_id),
          recipient_name: recipient_name || "LonerPay Customer",
          reference
        })
      }
    );

    const data = await response.json();

    if (!response.ok || data.status !== "success") {
      return res.status(response.status || 400).json({
        success: false,
        message: data.message || "Bet funding request failed",
        pairgate: data
      });
    }

    return res.status(200).json({
      success: true,
      test_mode: true,
      message: "Bet funding test successful",
      reference,
      data: data.data
    });

  } catch (error) {
    console.error("Bet funding error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process bet funding"
    });
  }
} 
