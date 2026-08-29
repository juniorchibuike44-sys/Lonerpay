import {
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

const ITERATIONS = 210000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function hashPin(pin) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(pin, salt, ITERATIONS, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${ITERATIONS}$${salt}$${hash}`;
}

function verifyPin(pin, storedHash) {
  try {
    const [algorithm, iterationsText, salt, expectedHex] = String(storedHash).split("$");
    if (algorithm !== "pbkdf2_sha256" || !salt || !expectedHex) return false;
    const iterations = Number(iterationsText);
    if (!Number.isSafeInteger(iterations) || iterations < 100000) return false;
    const actual = pbkdf2Sync(pin, salt, iterations, 32, "sha256");
    const expected = Buffer.from(expectedHex, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const authorization = req.headers.authorization;

  if (!supabaseUrl || !secretKey) {
    return res.status(500).json({ error: "Server security configuration is missing" });
  }
  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Login required" });
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: secretKey, Authorization: authorization }
  });
  if (!userResponse.ok) {
    return res.status(401).json({ error: "Invalid or expired login" });
  }
  const user = await userResponse.json();

  const tableUrl = `${supabaseUrl}/rest/v1/payment_pins`;
  const serviceHeaders = {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json"
  };

  const readResponse = await fetch(
    `${tableUrl}?user_id=eq.${encodeURIComponent(user.id)}&select=pin_hash,failed_attempts,locked_until`,
    { headers: serviceHeaders, cache: "no-store" }
  );
  if (!readResponse.ok) {
    return res.status(500).json({ error: "Could not read PIN settings" });
  }
  const rows = await readResponse.json();
  const record = rows[0] || null;
  const { action, pin, current_pin: currentPin } = req.body || {};

  if (action === "status") {
    return res.status(200).json({ has_pin: Boolean(record) });
  }

  if (action !== "set" && action !== "change") {
    return res.status(400).json({ error: "Invalid PIN action" });
  }
  if (!/^\d{4}$/.test(String(pin || ""))) {
    return res.status(400).json({ error: "PIN must contain exactly 4 digits" });
  }

  if (action === "set" && record) {
    return res.status(409).json({ error: "A payment PIN already exists" });
  }

  if (action === "change") {
    if (!record) {
      return res.status(404).json({ error: "Create a payment PIN first" });
    }
    const lockedUntil = record.locked_until ? new Date(record.locked_until) : null;
    if (lockedUntil && lockedUntil > new Date()) {
      return res.status(423).json({ error: "PIN is temporarily locked. Try again later." });
    }
    if (!/^\d{4}$/.test(String(currentPin || "")) || !verifyPin(String(currentPin), record.pin_hash)) {
      const failedAttempts = Number(record.failed_attempts || 0) + 1;
      const shouldLock = failedAttempts >= MAX_FAILED_ATTEMPTS;
      await fetch(`${tableUrl}?user_id=eq.${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: serviceHeaders,
        body: JSON.stringify({
          failed_attempts: shouldLock ? 0 : failedAttempts,
          locked_until: shouldLock
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString()
        })
      });
      return res.status(401).json({
        error: shouldLock
          ? "Too many incorrect attempts. PIN locked for 15 minutes."
          : "Current PIN is incorrect"
      });
    }
  }

  const payload = {
    user_id: user.id,
    pin_hash: hashPin(String(pin)),
    failed_attempts: 0,
    locked_until: null,
    updated_at: new Date().toISOString()
  };
  const saveResponse = await fetch(tableUrl, {
    method: "POST",
    headers: {
      ...serviceHeaders,
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(payload)
  });
  if (!saveResponse.ok) {
    return res.status(500).json({ error: "Could not save payment PIN" });
  }

  return res.status(200).json({
    success: true,
    message: action === "change" ? "Payment PIN changed successfully" : "Payment PIN created successfully"
  });
}
