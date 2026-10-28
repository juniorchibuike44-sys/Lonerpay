const rateBuckets = globalThis.__lonerPayRateBuckets || new Map();
globalThis.__lonerPayRateBuckets = rateBuckets;

export function hardenResponse(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

export function clientAddress(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

export function enforceRateLimit(req, res, { key = "api", limit = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const id = `${key}:${clientAddress(req)}`;
  const current = rateBuckets.get(id);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;
  bucket.count += 1;
  rateBuckets.set(id, bucket);
  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
  res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
  if (bucket.count > limit) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
    res.status(429).json({ error: "Too many requests. Please wait and try again." });
    return false;
  }
  return true;
}

export async function requireUser(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = String(req.headers.authorization || "");
  if (!supabaseUrl || !secretKey) {
    res.status(500).json({ error: "Server authentication configuration is missing" });
    return null;
  }
  if (!authorization.startsWith("Bearer ")) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: secretKey, Authorization: authorization },
    cache: "no-store"
  });
  if (!response.ok) {
    res.status(401).json({ error: "Invalid or expired login" });
    return null;
  }
  const user = await response.json();
  if (!user?.id) {
    res.status(401).json({ error: "Invalid account session" });
    return null;
  }
  return { user, supabaseUrl, secretKey, authorization };
}

export function cleanText(value, maxLength = 500) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

export async function enforceSharedRateLimit(req, res, { key = "api", limit = 20, windowMs = 60_000 } = {}) {
  const base = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !secret) {
    res.status(503).json({ error: "Security check temporarily unavailable. Please try again." });
    return false;
  }
  try {
    const { createHash } = await import("node:crypto");
    const bucket = createHash("sha256").update(key + ":" + clientAddress(req)).digest("hex");
    const response = await fetch(base + "/rest/v1/rpc/lp_check_rate_limit", {
      method: "POST",
      headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
      body: JSON.stringify({ p_bucket: bucket, p_limit: limit, p_window_ms: windowMs }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error("Rate limit service unavailable");
    const result = await response.json();
    if (!result || typeof result.allowed !== "boolean" || !Number.isFinite(result.remaining) || !Number.isFinite(result.retry_after)) throw new Error("Invalid rate limit response");
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.retry_after));
      res.status(429).json({ error: "Too many requests. Please wait and try again." });
      return false;
    }
    return true;
  } catch {
    res.status(503).json({ error: "Security check temporarily unavailable. Please try again." });
    return false;
  }
}
