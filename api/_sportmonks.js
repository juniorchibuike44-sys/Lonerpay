const BASE_URL = "https://api.sportmonks.com/v3/football";

export function getSportmonksToken() {
  return String(process.env.SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_TOKEN || "").trim();
}

export async function sportmonksRequest(path, params = {}) {
  const token = getSportmonksToken();
  if (!token) {
    const error = new Error("Sportmonks is not configured yet. Add SPORTMONKS_API_TOKEN in Vercel.");
    error.status = 503;
    throw error;
  }
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_token", token);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = String(payload?.message || payload?.error?.message || payload?.error || "").slice(0, 300);
    let message = providerMessage || "Sportmonks rejected the football-data request.";
    if (response.status === 401) message = "The Sportmonks API token is invalid or inactive.";
    if (response.status === 403) message = "The Sportmonks plan does not include this football feed.";
    if (response.status === 429) message = "The Sportmonks request limit has been reached. Please try again shortly.";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function participant(fixture, location) {
  return (fixture?.participants || []).find(item =>
    String(item?.meta?.location || item?.location || "").toLowerCase() === location
  ) || null;
}

function currentScore(fixture, location) {
  const scores = Array.isArray(fixture?.scores) ? fixture.scores : [];
  const matching = scores.filter(item =>
    String(item?.score?.participant || item?.location || "").toLowerCase() === location
  );
  const preferred = matching.find(item => String(item?.description || "").toUpperCase() === "CURRENT") || matching.at(-1);
  const value = preferred?.score?.goals;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function isoDate(value) {
  if (!value) return null;
  const text = String(value);
  return /(?:Z|[+-]\d\d:\d\d)$/.test(text) ? text : `${text.replace(" ", "T")}Z`;
}

export function adaptFixture(fixture) {
  const home = participant(fixture, "home") || fixture?.participants?.[0] || {};
  const away = participant(fixture, "away") || fixture?.participants?.[1] || {};
  const league = fixture?.league || {};
  const periods = Array.isArray(fixture?.periods) ? fixture.periods : [];
  const activePeriod = periods.find(period => period?.ticking) || periods.at(-1);
  return {
    fixture: {
      id: fixture?.id,
      date: isoDate(fixture?.starting_at),
      venue: { name: fixture?.venue?.name || null },
      status: {
        short: String(fixture?.state?.state || fixture?.state?.short_name || "NS").toUpperCase(),
        long: fixture?.state?.name || fixture?.state?.short_name || "Scheduled",
        elapsed: Number(activePeriod?.minutes || 0) || null
      }
    },
    league: {
      id: league?.id,
      name: league?.name || "Football",
      country: league?.country?.name || league?.country?.official_name || ""
    },
    teams: {
      home: { id: home?.id, name: home?.name || "Home", logo: home?.image_path || null },
      away: { id: away?.id, name: away?.name || "Away", logo: away?.image_path || null }
    },
    goals: { home: currentScore(fixture, "home"), away: currentScore(fixture, "away") }
  };
}

const STAT_NAMES = {
  SHOTS_ON_TARGET: "Shots on Goal",
  BALL_POSSESSION: "Ball Possession",
  CORNERS: "Corner Kicks",
  YELLOWCARDS: "Yellow Cards",
  YELLOW_CARDS: "Yellow Cards"
};

export function adaptStatistics(fixture) {
  const adapted = adaptFixture(fixture);
  return [
    { side: "home", team: adapted.teams.home },
    { side: "away", team: adapted.teams.away }
  ].map(({ side, team }) => ({
    team,
    statistics: (fixture?.statistics || []).filter(item =>
      String(item?.location || "").toLowerCase() === side
    ).map(item => {
      const developerName = String(item?.type?.developer_name || "").toUpperCase();
      const type = STAT_NAMES[developerName] || item?.type?.name;
      if (!type) return null;
      let value = item?.data?.value ?? "—";
      if (developerName === "BALL_POSSESSION" && value !== "—") value = `${value}%`;
      return { type, value };
    }).filter(Boolean)
  }));
}

export function adaptPrediction(payload) {
  const result = (payload?.data || []).find(item =>
    item?.type_id === 237 || item?.type?.developer_name === "FULLTIME_RESULT_PROBABILITY" ||
    (item?.predictions && "home" in item.predictions && "draw" in item.predictions && "away" in item.predictions)
  );
  if (!result) return null;
  const values = result.predictions || {};
  const winner = [["Home", values.home], ["Draw", values.draw], ["Away", values.away]]
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0];
  return {
    predictions: {
      percent: {
        home: `${Number(values.home || 0).toFixed(1)}%`,
        draw: `${Number(values.draw || 0).toFixed(1)}%`,
        away: `${Number(values.away || 0).toFixed(1)}%`
      },
      winner: { comment: `${winner[0]} has the highest model probability (${Number(winner[1] || 0).toFixed(1)}%).` },
      advice: "Probability-based preview from available historical match data."
    }
  };
}
