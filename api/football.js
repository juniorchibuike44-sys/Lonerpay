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
    const response = await fetch(
      `https://v3.football.api-sports.io/fixtures?date=${requestedDate}&timezone=Africa%2FLagos`,
      {
        headers: {
          "x-apisports-key": apiKey
        }
      }
    );

    const data = await response.json();

    if (!response.ok || (data.errors && Object.keys(data.errors).length)) {
      const providerErrors = data?.errors && typeof data.errors === "object"
        ? Object.values(data.errors).filter(Boolean).map(String)
        : [];
      const providerStatus = Number(response.status || 502);
      let reason = "The football-data provider rejected the request.";
      if (providerStatus === 401) reason = "The football-data API key is invalid or inactive.";
      if (providerStatus === 403) reason = "The football-data subscription does not allow this request.";
      if (providerStatus === 429) reason = "The football-data daily request limit has been reached.";
      if (providerErrors.length) reason = providerErrors.join(" ").slice(0, 300);
      console.error("API-Football request rejected", { status: providerStatus, errors: providerErrors });
      return res.status(providerStatus >= 400 ? providerStatus : 502).json({
        error: "Football matches are temporarily unavailable",
        provider_status: providerStatus,
        provider_reason: reason
      });
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=180");
    return res.status(200).json({ ...data, range: { date: requestedDate, timezone: "Africa/Lagos" } });
  } catch (error) {
    console.error("Football API error:", error);

    return res.status(500).json({
      error: "Unable to load football matches"
    });
  }
} 
