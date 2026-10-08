import { adaptFixture, adaptPrediction, adaptStatistics, sportmonksRequest } from "./_sportmonks.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const fixtureId = String(req.query?.fixture || "");
  if (!/^\d+$/.test(fixtureId)) return res.status(400).json({ error: "Fixture ID is required" });

  try {
    const fixturePayload = await sportmonksRequest(`/fixtures/${fixtureId}`, {
      include: "participants;league.country;state;scores;venue;periods;statistics.type"
    });
    const rawFixture = fixturePayload?.data;
    if (!rawFixture) return res.status(404).json({ error: "Match information not found" });

    let prediction = null;
    try {
      const predictionPayload = await sportmonksRequest(`/predictions/probabilities/fixtures/${fixtureId}`, {
        include: "type", per_page: 50
      });
      prediction = adaptPrediction(predictionPayload);
    } catch (predictionError) {
      // Some plans exclude predictions; match details and statistics should still load.
      console.warn("Sportmonks prediction unavailable", {
        status: predictionError?.status, message: predictionError?.message
      });
    }

    const match = adaptFixture(rawFixture);
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({
      fixture: { id: match.fixture.id, date: match.fixture.date, venue: match.fixture.venue?.name || "Not available" },
      league: match.league,
      home: match.teams.home,
      away: match.teams.away,
      status: match.fixture.status?.long || "Scheduled",
      goals: match.goals,
      statistics: adaptStatistics(rawFixture),
      prediction,
      provider: "sportmonks"
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    console.error("Sportmonks analysis request failed", { status, message: error?.message });
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: error?.message || "Unable to analyse this match",
      provider: "sportmonks"
    });
  }
}
