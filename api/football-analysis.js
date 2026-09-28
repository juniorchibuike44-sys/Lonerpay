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

  const { fixture } = req.query;

  if (!fixture) {
    return res.status(400).json({
      error: "Fixture ID is required"
    });
  }

  try {
    const response = await fetch(
      `https://v3.football.api-sports.io/fixtures?id=${fixture}`,
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

    if (data.errors && Object.keys(data.errors).length > 0) {
      return res.status(400).json({
        error: "Football data unavailable",
        details: data.errors
      });
    }

    const match = data.response?.[0];

    if (!match) {
      return res.status(404).json({
        error: "Match information not found"
      });
    }
const statsResponse = await fetch(
  `https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixture}`,
  {
    headers: {
      "x-apisports-key": apiKey
    }
  }
);

const statsData = await statsResponse.json();

const statistics =
  statsResponse.ok && Array.isArray(statsData.response)
    ? statsData.response
    : []; 
    return res.status(200).json({
      fixture: {
        id: match.fixture.id,
        date: match.fixture.date,
        venue: match.fixture.venue?.name || "Not available"
      },

      league: {
        name: match.league.name,
        country: match.league.country
      },

      home: {
        id: match.teams.home.id,
        name: match.teams.home.name,
        logo: match.teams.home.logo
      },

      away: {
        id: match.teams.away.id,
        name: match.teams.away.name,
        logo: match.teams.away.logo
      },

  status: match.fixture.status?.long || "Scheduled",
statistics: statistics
}); 
  } catch (error) {
    console.error("Football analysis error:", error);

    return res.status(500).json({
      error: "Unable to analyse this match"
    });
  }
} 
