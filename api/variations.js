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
function normalizedNetwork(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace("etisalat", "9mobile");
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
      let categories = cacheGet("categories", 10 * 60_000);
      let categoriesResult = null;
      if (!categories) {
        categoriesResult = await pairgateRequest("/data-plans/categories", { method: "GET" });
        categories = Array.isArray(categoriesResult.data?.data) ? categoriesResult.data.data : [];
        if (categories.length) cacheSet("categories", categories);
      }
      const networkCategories = categories.filter(item => normalizedNetwork(item?.provider_name) === normalizedNetwork(network));
      const providerId = String(networkCategories[0]?.provider_id || "");
      const planTypes = [...new Set(networkCategories.map(item => String(item?.plan_type || "").trim()).filter(Boolean))];
      if ((categoriesResult && !categoriesResult.response.ok) || !providerId || !planTypes.length) {
        return res.status(502).json({ error: `Pairgate has no active ${network.toUpperCase()} data categories for this API account` });
      }
      const results = await Promise.all(planTypes.map(planType =>
        pairgateRequest(`/data-plans?provider_id=${encodeURIComponent(providerId)}&plan_type=${encodeURIComponent(planType)}`, { method: "GET" })
          .then(result => ({ ...result, planType }))
      ));
      const plans = [];
      for (const result of results) {
        if (!result.response.ok || result.data?.status !== "success") continue;
        const payload = result.data?.data;
        const list = Array.isArray(payload)
          ? payload
          : Object.values(payload || {}).find(value => Array.isArray(value)) || [];
        for (const plan of list) {
          const id = String(plan?.plan_id || plan?.id || "").trim();
          const price = Number(plan?.price || plan?.amount);
          if (!id || !Number.isFinite(price) || price <= 0) continue;
          plans.push({
            code: id,
            name: `${String(plan?.name || "Data plan")} · ${Number(plan?.duration || 0) || "—"} days`,
            amount: price
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
