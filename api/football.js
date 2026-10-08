import { adaptFixture, sportmonksRequest } from "./_sportmonks.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const lagosDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const requestedDate = String(req.query?.date || lagosDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return res.status(400).json({ error: "Invalid match date" });

  try {
    const payload = await sportmonksRequest(`/fixtures/date/${requestedDate}`, {
      include: "participants;league.country;state;scores;periods",
      per_page: 100
    });
    const fixtures = Array.isArray(payload?.data) ? payload.data.map(adaptFixture) : [];
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=180");
    return res.status(200).json({
      response: fixtures,
      provider: "sportmonks",
      results: fixtures.length,
      range: { date: requestedDate, timezone: "Africa/Lagos" }
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    console.error("Sportmonks fixtures request failed", { status, message: error?.message });
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: "Football matches are temporarily unavailable",
      provider: "sportmonks",
      provider_status: status,
      provider_reason: error?.message || "Unable to load football matches"
    });
  }
}
