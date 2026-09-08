export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  const authorization = req.headers.authorization;

  if (!supabaseUrl || !supabaseSecretKey || !paystackSecretKey) {
    return res.status(500).json({
      error: "Wallet verification configuration is missing"
    });
  }

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Login required"
    });
  }

  const reference = String(req.body?.reference || "").trim();

  if (!reference) {
    return res.status(400).json({
      error: "Payment reference is required"
    });
  }

  try {
    // Confirm the logged-in LonerPay user
    const userResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: supabaseSecretKey,
          Authorization: authorization
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Invalid or expired login"
      });
    }

    const user = await userResponse.json();

    // Verify the payment directly with Paystack
    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`
        }
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      return res.status(502).json({
        error: paystackData.message || "Could not verify payment"
      });
    }

    const transaction = paystackData.data;

    if (transaction.status !== "success") {
      return res.status(400).json({
        error: "Payment was not successful"
      });
    }

    let metadata = transaction.metadata || {};

    if (typeof metadata === "string") {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = {};
      }
    }

    if (String(metadata.user_id) !== String(user.id)) {
      return res.status(403).json({
        error: "Payment does not belong to this user"
      });
    }

    const walletAmount = Number(metadata.wallet_amount);

    if (!Number.isFinite(walletAmount) || walletAmount < 100) {
      return res.status(400).json({
        error: "Invalid wallet funding amount"
      });
    }

    // Secure atomic wallet credit.
    // We will create this Supabase function next.
    const creditResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/credit_wallet_from_paystack`,
      {
        method: "POST",
        headers: {
          apikey: supabaseSecretKey,
          Authorization: `Bearer ${supabaseSecretKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_user_id: user.id,
          p_amount: walletAmount,
          p_reference: reference
        })
      }
    );

    const creditText = await creditResponse.text();

    if (!creditResponse.ok) {
      return res.status(500).json({
        error: "Payment verified but wallet could not be credited",
        message: creditText
      });
    }

    let creditResult = null;

    try {
      creditResult = JSON.parse(creditText);
    } catch {
      creditResult = creditText;
    }

    return res.status(200).json({
      success: true,
      verified: true,
      reference,
      amount: walletAmount,
      wallet: creditResult
    });
  } catch (error) {
    return res.status(500).json({
      error: "Wallet verification failed",
      message: error.message
    });
  }
          } 
