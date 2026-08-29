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
      error: "Server transaction configuration is missing"
    });
  }

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Login required" });
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: secretKey,
        Authorization: authorization
      }
    });

    if (!userResponse.ok) {
      return res.status(401).json({ error: "Invalid or expired login" });
    }

    const user = await userResponse.json();
    const query = new URLSearchParams({
      user_id: `eq.${user.id}`,
      transaction_type: "eq.debit",
      select: "request_id,service,amount,status,details,created_at",
      order: "created_at.desc",
      limit: "50"
    });

    const transactionsResponse = await fetch(
      `${supabaseUrl}/rest/v1/wallet_transactions?${query.toString()}`,
      {
        headers: {
          apikey: secretKey,
          Authorization: authorization,
          Accept: "application/json"
        }
      }
    );

    const text = await transactionsResponse.text();
    let transactions;

    try {
      transactions = text ? JSON.parse(text) : [];
    } catch {
      transactions = [];
    }

    if (!transactionsResponse.ok) {
      return res.status(500).json({
        error: "Could not load transactions",
        message: transactions?.message || text
      });
    }

    return res.status(200).json({ transactions });
  } catch (error) {
    return res.status(500).json({
      error: "Transaction history request failed",
      message: error.message
    });
  }
}
