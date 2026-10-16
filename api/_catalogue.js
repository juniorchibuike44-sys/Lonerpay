import { randomUUID } from "node:crypto";
import { pairgateRequest } from "./_pairgate.js";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const busy = retryAfter => Object.assign(new Error("Data plans are busy. Please try again shortly."), { statusCode: 429, retryAfter });
async function control(action, path, owner, payload = null, delay = 60) {
  const response = await fetch(new URL("/rest/v1/rpc/lp_catalogue_control", process.env.SUPABASE_URL), {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_action: action, p_path: path, p_owner: owner, p_payload: payload, p_delay: delay }),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw Object.assign(new Error("Data catalogue setup is unavailable."), { statusCode: 503 });
  return response.json();
}
export async function sharedCatalogueRequest(path) {
  const owner = randomUUID();
  const deadline = Date.now() + 10000;
  while (true) {
    const lock = await control("claim", path, owner);
    if (lock.state === "cached") return { response: { ok: true, status: 200 }, data: lock.payload };
    if (lock.state === "cooldown") throw busy(Number(lock.retryAfter) || 60);
    if (lock.state === "acquired") break;
    if (Date.now() >= deadline) throw busy(5);
    await sleep(500);
  }
  let released = false;
  try {
    const startedAt = Date.now();
    const result = await pairgateRequest(path, { method: "GET", signal: AbortSignal.timeout(12000) });
    console.info("Pairgate catalogue response", { path, status: result.response.status, providerStatus: String(result.data?.status || "").slice(0, 40), startedAt: new Date(startedAt).toISOString(), durationMs: Date.now() - startedAt, retryAfter: result.response.headers?.get?.("retry-after") || null });
    if (result.response.status === 429) {
      const header = result.response.headers?.get?.("retry-after");
      const numeric = Number(header);
      const dateSeconds = Math.ceil((Date.parse(header) - Date.now()) / 1000);
      const seconds = Math.min(86400, Math.max(1, Number.isFinite(numeric) && numeric > 0 ? numeric : dateSeconds > 0 ? dateSeconds : 60));
      await control("cooldown", path, owner, null, seconds);
      released = true;
      throw busy(seconds);
    }
    const payload = result.response.ok && result.data?.status === "success" ? result.data : null;
    const saved = await control("finish", path, owner, payload);
    released = true;
    if (saved.state === "lost") throw Object.assign(new Error("Data catalogue refresh expired. Please try again."), { statusCode: 503 });
    return result;
  } finally {
    if (!released) await control("finish", path, owner).catch(() => {});
  }
}

const fallbackPlanTypes = ["CG", "CG_LITE", "SME", "GIFTING", "AWOOF"];
export async function cataloguePlanTypes(network) {
  try {
    const result = await sharedCatalogueRequest("/data-plans/categories");
    if (result.response.ok && result.data?.status === "success" && Array.isArray(result.data.data)) {
      const aliases = network === "9mobile" ? ["9mobile", "etisalat", "t2"] : [network];
      const types = [...new Set(result.data.data.filter(row =>
        aliases.includes(String(row?.provider_name || "").trim().toLowerCase()) &&
        (!row.service_type || String(row.service_type).toLowerCase() === "data")
      ).map(row => String(row.plan_type || "").trim()).filter(type => fallbackPlanTypes.includes(type)))];
      if (types.length) return types;
    }
  } catch (_) {
    // Existing cached families can still be served during a provider outage.
  }
  return network === "glo" || network === "9mobile"
    ? ["GIFTING", "AWOOF", "CG", "CG_LITE", "SME"]
    : fallbackPlanTypes;
}
