export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const { provider_id, customer_id } = req.body || {};

    if (!provider_id || !customer_id) {
      return res.status(400).json({
        success: false,
        message: "Betting platform and customer ID are required"
      });
    }

    const apiKey = process.env.PAIRGATE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Pairgate API configuration missing"
      });
    }

    // Pairgate TEST verification endpoint
    const response = await fetch(
      https://pairgate.com/api/v1/bet/verify 
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          provider_id: String(provider_id).trim().toLowerCase(),
          customer_id: String(customer_id).trim()
        })
      }
    );

    const data = await response.json();

    if (
      !response.ok ||
      data?.status !== "success" ||
      data?.data?.status !== true
    ) {
      return res.status(400).json({
        success: false,
        message: data?.message || "Unable to verify betting account"
      });
    }

    return res.status(200).json({
      success: true,
      test_mode: false, 
      customer_name: data?.data?.customer_name || "",
      message: "Betting account verified"
    });

  } catch (error) {
    console.error("Bet account verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify betting account"
    });
  }
} 
