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
      error: "Wallet funding configuration is missing"
    });
  }

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Login required"
    });
  }

  const amount = Number(req.body?.amount);

  if (!Number.isFinite(amount) || amount < 100) {
    return res.status(400).json({
      error: "Minimum funding amount is ₦100"
    });
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseSecretKey,
        Authorization: authorization
      }
    });

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Invalid or expired login"
      });
    }

    const user = await userResponse.json();

    if (!user?.email) {
      return res.status(400).json({
        error: "User email not found"
      });
    }

    const reference =
      `LONERPAY-${Date.now()}-${user.id.slice(0, 8)}`;

    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: user.email,
          amount: String(Math.round(amount * 100)),
          reference,
          metadata: JSON.stringify({
            user_id: user.id,
            wallet_amount: amount
          })
        })
      }
    );

    const data = await paystackResponse.json();

    if (!paystackResponse.ok || !data.status) {
      return res.status(502).json({
        error: data.message || "Could not initialize wallet funding"
      });
    }

    return res.status(200).json({
      authorization_url: data.data.authorization_url,
      checkout_url: data.data.authorization_url,
      payment_url: data.data.authorization_url,
      reference: data.data.reference
    });
  } catch (error) {
    return res.status(500).json({
      error: "Wallet funding request failed",
      message: error.message
    });
  }
      } 
