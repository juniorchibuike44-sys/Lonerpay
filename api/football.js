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
    const lagosDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
    const requestedDate = String(req.query?.date || lagosDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return res.status(400).json({ error: "Invalid match date" });
    }
    const centre = new Date(`${requestedDate}T12:00:00Z`);
    const formatDate = value => value.toISOString().slice(0, 10);
    const from = formatDate(new Date(centre.getTime() - 86400000));
    const to = formatDate(new Date(centre.getTime() + 2 * 86400000));
    const response = await fetch(
      `https://v3.football.api-sports.io/fixtures?from=${from}&to=${to}&timezone=Africa%2FLagos`,
      {
        headers: {
          "x-apisports-key": apiKey
        }
      }
    );

    const data = await response.json();

    if (!response.ok || (data.errors && Object.keys(data.errors).length)) {
      return res.status(response.status).json({
        error: "Football API request failed"
      });
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=180");
    return res.status(200).json({ ...data, range: { from, to, timezone: "Africa/Lagos" } });
  } catch (error) {
    console.error("Football API error:", error);

    return res.status(500).json({
      error: "Unable to load football matches"
    });
  }
} 
