export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.PAIRGATE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Pairgate API key is missing"
      });
    }

    const response = await fetch(
      "https://pairgate.com/api/v1/test/providers/betting", 
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json"
        }
      }
    );

    const data = await response.json();

    if (!response.ok || data?.status !== "success") {
      return res.status(response.status || 400).json({
        success: false,
        message: data?.message || "Unable to load betting providers"
      });
    }

    return res.status(200).json({
      success: true,
      providers: data.data || []
    });

  } catch (error) {
    console.error("Bet providers error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load betting providers"
    });
  }
} 
