import { cleanText, enforceRateLimit, hardenResponse, requireUser } from "./_security.js";

const CATEGORIES = new Set(["account", "payment", "transfer", "verification", "security", "other"]);

export default async function handler(req, res) {
  hardenResponse(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!enforceRateLimit(req, res, { key: "support", limit: 5, windowMs: 10 * 60_000 })) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const category = cleanText(req.body?.category, 30).toLowerCase();
  const message = cleanText(req.body?.message, 1200);
  if (!CATEGORIES.has(category) || message.length < 10) {
    return res.status(400).json({ error: "Select a category and provide at least 10 characters." });
  }

  const reference = `SUP-${Date.now().toString(36).toUpperCase()}-${auth.user.id.slice(0, 6).toUpperCase()}`;
  const existing = auth.user.app_metadata || {};
  const update = await fetch(`${auth.supabaseUrl}/auth/v1/admin/users/${auth.user.id}`, {
    method: "PUT",
    headers: {
      apikey: auth.secretKey,
      Authorization: `Bearer ${auth.secretKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      app_metadata: {
        ...existing,
        last_support_request: {
          reference, category, message, status: "open", created_at: new Date().toISOString()
        }
      }
    })
  });
  if (!update.ok) return res.status(500).json({ error: "Could not submit the support request" });
  return res.status(201).json({ success: true, reference, message: "Support request submitted." });
}
