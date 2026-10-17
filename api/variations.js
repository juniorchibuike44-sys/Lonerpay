import { sharedCatalogueRequest as catalogueRequest, cataloguePlanTypes } from "./_catalogue.js";

const dataPlanCache = globalThis.__lonerPayDataPlanCacheV2 || new Map();
globalThis.__lonerPayDataPlanCacheV2 = dataPlanCache;
const cacheGet = (key, maxAge) => {
  const item = dataPlanCache.get(key);
  return item && Date.now() - item.savedAt < maxAge ? item.value : null;
};
const cacheSet = (key, value) => { dataPlanCache.set(key, { savedAt: Date.now(), value }); return value; };


const allowedServices = new Set([
  // Data
  "mtn-data",
  "airtel-data",
  "glo-data",
  "etisalat-data",

  // Education
  "waec",
  "waec-registration",
  "jamb"
]);

const dataServices = new Set(["mtn-data", "airtel-data", "glo-data", "etisalat-data"]);

function pairgatePlans(payload) {
  if (Array.isArray(payload)) return payload;
  return Object.values(payload || {}).flatMap(value => Array.isArray(value) ? value : []);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  res.setHeader("Cache-Control", "no-store");

  const serviceID = String(req.query?.serviceID || "");
  const authorization = req.headers.authorization;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  const vtpassApiKey = process.env.VTPASS_API_KEY;
  const vtpassSecretKey = process.env.VTPASS_SECRET_KEY;
  const vtpassPublicKey = process.env.VTPASS_PUBLIC_KEY || vtpassSecretKey;
  const vtpassBaseUrl = String(
    process.env.VTPASS_BASE_URL ||
    (String(process.env.VTPASS_ENV || "").toLowerCase() === "live"
      ? "https://vtpass.com/api"
      : "https://sandbox.vtpass.com/api")
  ).replace(/\/+$/, "");

  // Only allow services used by LonerPay
  if (!allowedServices.has(serviceID)) {
    return res.status(400).json({
      error: "Invalid service"
    });
  }

  // Make sure required server environment variables exist
  if (!supabaseUrl || !supabaseSecretKey ||
      (dataServices.has(serviceID) ? !process.env.PAIRGATE_API_KEY : (!vtpassApiKey || !vtpassSecretKey))) {
    return res.status(500).json({
      error: "Server configuration is missing"
    });
  }

  // User must be logged in
  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Login required"
    });
  }

  try {
    // Verify the logged-in LonerPay user
    const userResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: supabaseSecretKey,
          Authorization: authorization
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Invalid or expired login"
      });
    }

    // A single database read warms every network without calling Pairgate.
    // Snapshots are display-only; secure-pay independently verifies the price.
    if (dataServices.has(serviceID) && req.query?.snapshot === "1") {
      const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const url = new URL("/rest/v1/lp_catalogue_cache", supabaseUrl);
      url.searchParams.set("select", "path,payload,saved_at");
      url.searchParams.set("saved_at", "gte." + cutoff);
      const response = await fetch(url, { headers: { apikey: supabaseSecretKey, Authorization: `Bearer ${supabaseSecretKey}` }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) return res.status(503).json({ error: "Saved data plans could not be loaded." });
      const rows = await response.json();
      const catalogues = {};
      for (const id of dataServices) {
        const slug = id === "etisalat-data" ? "9mobile" : id.replace(/-data$/, "");
        const byCode = new Map();
        for (const row of rows) {
          const parsed = new URL(row.path, "https://catalogue.invalid");
          if (parsed.pathname !== "/data-plans" || parsed.searchParams.get("provider_id") !== slug || row.payload?.status !== "success") continue;
          for (const plan of pairgatePlans(row.payload?.data)) {
            const code = String(plan?.plan_id || plan?.id || "").trim();
            const amount = Number(plan?.price || plan?.amount);
            if (!code || !Number.isFinite(amount) || amount <= 0) continue;
            const previous = byCode.get(code);
            const savedAt = Date.parse(row.saved_at);
            if (!previous || savedAt > previous.savedAt) byCode.set(code, {
              code, name: `${String(plan.name || "Data plan")} · ${Number(plan.duration || 0) || "—"} days`,
              amount, savedAt
            });
          }
        }
        const plans = [...byCode.values()].sort((a, b) => a.amount - b.amount);
        if (plans.length) catalogues[id] = {
          savedAt: Math.min(...plans.map(plan => plan.savedAt)),
          variations: plans.map(({ savedAt, ...plan }) => plan)
        };
      }
      return res.status(200).json({ catalogues });
    }

    if (dataServices.has(serviceID)) {
      const network = serviceID === "etisalat-data" ? "9mobile" : serviceID.replace(/-data$/, "");
      const cachedPlans = cacheGet(`plans:${network}`, 10 * 60_000);
      if (cachedPlans) return res.status(200).json({ serviceID, serviceName: `${network.toUpperCase()} Data`, provider: "pairgate", cached: true, variations: cachedPlans });
      const planTypes = await cataloguePlanTypes(network);
      // Pairgate's documented provider_id is the network slug itself. Query every
      // supported plan family directly; the category endpoint is not the catalogue.
      const settledResults = [];
      let catalogueError = null;
      for (const planType of planTypes) {
        try {
          const result = await catalogueRequest(`/data-plans?provider_id=${encodeURIComponent(network)}&plan_type=${encodeURIComponent(planType)}`);
          settledResults.push({ status: "fulfilled", value: { ...result, planType } });
        } catch (error) {
          if (error.statusCode === 429 || error.statusCode === 503) catalogueError = error;
          settledResults.push({ status: "rejected", reason: error });
        }
      }
      const results = settledResults
        .filter(result => result.status === "fulfilled")
        .map(result => result.value);
      const failedTypes = planTypes.filter(type => !results.some(result => result.planType === type && result.response.ok && result.data?.status === "success"));
      if (failedTypes.length) console.warn("Data catalogue incomplete", { network, failedTypes, responses: results.map(r => ({ planType: r.planType, status: r.response.status })) });
      const plans = [];
      for (const result of results) {
        if (!result.response.ok || result.data?.status !== "success") continue;
        for (const plan of pairgatePlans(result.data?.data)) {
          const id = String(plan?.plan_id || plan?.id || "").trim();
          const price = Number(plan?.price || plan?.amount);
          if (!id || !Number.isFinite(price) || price <= 0) continue;
          plans.push({
            code: id,
            name: `${String(plan?.name || "Data plan")} · ${Number(plan?.duration || 0) || "—"} days`,
            amount: price,
            planType: result.planType
          });
        }
      }
      const unique = [...new Map(plans.map(plan => [plan.code, plan])).values()]
        .sort((a, b) => a.amount - b.amount);
      if (!unique.length && catalogueError) throw catalogueError;
      if (!unique.length) return res.status(502).json({ error: failedTypes.length ? "Data plans are temporarily unavailable. Please try again shortly." : "No data bundles are currently available for this network." });
      // A successful family must not turn failed families into a cached full catalogue.
      if (!failedTypes.length) cacheSet(`plans:${network}`, unique);
      return res.status(200).json({ serviceID, serviceName: `${network.toUpperCase()} Data`, provider: "pairgate", partial: failedTypes.length > 0, retryAfter: catalogueError?.retryAfter, variations: unique });
    }

    // Get service variations from VTpass
    const providerResponse = await fetch(
      `${vtpassBaseUrl}/service-variations?serviceID=${encodeURIComponent(
        serviceID
      )}`,
      {
        headers: {
          "api-key": vtpassApiKey,
          "public-key": vtpassPublicKey,
          Accept: "application/json"
        }
      }
    );

    const providerData = await providerResponse.json();

    const variations =
      providerData?.content?.variations;

    if (
      !providerResponse.ok ||
      !Array.isArray(variations)
    ) {
      return res.status(502).json({
        error:
          providerData?.response_description ||
          providerData?.message ||
          "Could not load service options"
      });
    }

    // Return a clean format to the LonerPay dashboard
    return res.status(200).json({
      serviceID,

      serviceName:
        providerData?.content?.ServiceName ||
        serviceID,

      variations: variations
        .map(variation => ({
          code:
            variation.variation_code,

          name:
            variation.name,

          amount:
            Number(
              variation.variation_amount
            )
        }))
        .filter(
          variation =>
            variation.code &&
            Number.isFinite(
              variation.amount
            ) &&
            variation.amount > 0
        )
    });

  } catch (error) {
    if (error.statusCode === 429) {
      res.setHeader("Retry-After", String(error.retryAfter));
      return res.status(429).json({ error: error.message, retryAfter: error.retryAfter });
    }
    if (error.statusCode === 503) return res.status(503).json({ error: error.message });
    console.error(
      "Service variations error:",
      error
    );

    return res.status(500).json({
      error:
        "Service-options request failed",

      message:
        error?.message ||
        "Unknown server error"
    });
  }
} 

