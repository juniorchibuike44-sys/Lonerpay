export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const authorization = req.headers.authorization;

  if (!supabaseUrl || !secretKey) {
    return res.status(500).json({
      error: "Server wallet configuration is missing"
    });
  }

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Login required"
    });
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: secretKey,
        Authorization: authorization
      }
    });

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Invalid or expired login"
      });
    }

    const user = await userResponse.json();

    const walletResponse = await fetch(
      `${supabaseUrl}/rest/v1/wallets?user_id=eq.${encodeURIComponent(
        user.id
      )}&select=balance&limit=1`,
      {
        headers: {
          apikey: secretKey,
          Authorization: authorization,
          Accept: "application/json"
        }
      }
    );

    if (!walletResponse.ok) {
      const message = await walletResponse.text();

      return res.status(500).json({
        error: "Could not load wallet",
        message
      });
    }

    const wallets = await walletResponse.json();

    if (!wallets.length) {
      return res.status(404).json({
        error: "Wallet not found"
      });
    }

    return res.status(200).json({
      balance: Number(wallets[0].balance)
    });
  } catch (error) {
    return res.status(500).json({
      error: "Wallet request failed",
      message: error.message
    });
  }
} 
