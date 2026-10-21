// Public display catalogue only. Never return the raw provider payload.
const services = ["mtn-data", "airtel-data", "glo-data", "etisalat-data"];
const plansIn = payload => Array.isArray(payload) ? payload : Object.values(payload || {}).flatMap(value => Array.isArray(value) ? value : []);
export function savedDataCatalogues(rows) {
  const catalogues = {};
  for (const serviceID of services) {
    const network = serviceID === "etisalat-data" ? "9mobile" : serviceID.replace(/-data$/, "");
    const byCode = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || typeof row !== "object") continue;
      let path;
      try { path = new URL(row.path, "https://catalogue.invalid"); } catch { continue; }
      const savedAt = Date.parse(row.saved_at);
      if (path.pathname !== "/data-plans" || path.searchParams.get("provider_id") !== network || row.payload?.status !== "success" || !Number.isFinite(savedAt)) continue;
      for (const plan of plansIn(row.payload.data)) {
        const code = String(plan?.plan_id || plan?.id || "").trim();
        const amount = Number(plan?.price || plan?.amount);
        if (!code || !Number.isFinite(amount) || amount <= 0) continue;
        if (!byCode.has(code) || savedAt > byCode.get(code).savedAt) byCode.set(code, {
          code, name: `${String(plan.name || "Data plan")} · ${Number(plan.duration || 0) || "—"} days`,
          amount, planType:path.searchParams.get("plan_type"), savedAt
        });
      }
    }
    const plans = [...byCode.values()].sort((a,b) => a.amount-b.amount);
    if (plans.length) catalogues[serviceID] = {savedAt:Math.min(...plans.map(p=>p.savedAt)),variations:plans.map(({savedAt,...plan})=>plan)};
  }
  return catalogues;
}
export async function readSavedDataCatalogues() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error("Saved catalogue is not configured.");
  const url = new URL("/rest/v1/lp_catalogue_cache", process.env.SUPABASE_URL);
  url.searchParams.set("select", "path,payload,saved_at");
  const response = await fetch(url, {headers:{apikey:process.env.SUPABASE_SECRET_KEY,Authorization:`Bearer ${process.env.SUPABASE_SECRET_KEY}`},signal:AbortSignal.timeout(5000)});
  if (!response.ok) throw new Error("Saved catalogue is unavailable.");
  return savedDataCatalogues(await response.json());
}
