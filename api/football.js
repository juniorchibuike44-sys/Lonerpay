export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "API Football key is missing"
    });
  }

  try {
    const response = await fetch(
      `https://v3.football.api-sports.io/fixtures?date=${new Date().toISOString().split("T")[0]}`, 
      {
        headers: {
          "x-apisports-key": apiKey
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Football API request failed"
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Football API error:", error);

    return res.status(500).json({
      error: "Unable to load football matches"
    });
  }
} 
