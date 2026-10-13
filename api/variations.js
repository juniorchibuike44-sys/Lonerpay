import { pairgateRequest } from "./_pairgate.js";

const dataPlanCache = globalThis.__lonerPayDataPlanCache || new Map();
globalThis.__lonerPayDataPlanCache = dataPlanCache;
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
const pairgateDataPlanTypes = ["CG", "CG_LITE", "SME", "GIFTING", "AWOOF"];

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

    if (dataServices.has(serviceID)) {
      const network = serviceID === "etisalat-data" ? "9mobile" : serviceID.replace(/-data$/, "");
      const cachedPlans = cacheGet(`plans:${network}`, 10 * 60_000);
      if (cachedPlans) return res.status(200).json({ serviceID, serviceName: `${network.toUpperCase()} Data`, provider: "pairgate", cached: true, variations: cachedPlans });
      // Pairgate's documented provider_id is the network slug itself. Query every
      // supported plan family directly; the category endpoint is not the catalogue.
      const settledResults = await Promise.allSettled(pairgateDataPlanTypes.map(planType =>
        pairgateRequest(`/data-plans?provider_id=${encodeURIComponent(network)}&plan_type=${encodeURIComponent(planType)}`, { method: "GET" })
          .then(result => ({ ...result, planType }))
      ));
      const results = settledResults
        .filter(result => result.status === "fulfilled")
        .map(result => result.value);
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
      if (!unique.length) return res.status(502).json({ error: "Pairgate did not return data plans for this network" });
      cacheSet(`plans:${network}`, unique);
      return res.status(200).json({ serviceID, serviceName: `${network.toUpperCase()} Data`, provider: "pairgate", variations: unique });
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
