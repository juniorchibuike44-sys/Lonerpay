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
        message: "Provider and betting ID are required."
      });
    }

    const apiKey = process.env.PAIRGATE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Pairgate API key is not configured."
      });
    }

    // Pairgate TEST verification endpoint
    const response = await fetch(
      "https://pairgate.com/api/v1/test/bet/verify",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          provider_id,
          customer_id
        })
      }
    );

    const data = await response.json();

    if (!response.ok || data.status !== "success") {
      return res.status(response.status || 400).json({
        success: false,
        message: data.message || "Unable to verify betting account.",
        data
      });
    }

    return res.status(200).json({
      success: true,
      test_mode: true,
      customer_name: data.data?.customer_name || "",
      data: data.data
    });

  } catch (error) {
    console.error("Bet verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify betting account."
    });
  }
} 
