export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const { provider_id, amount, customer_id, recipient_name } = req.body;

    if (!provider_id || !amount || !customer_id) {
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
