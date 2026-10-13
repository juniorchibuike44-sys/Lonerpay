import { cleanText, enforceRateLimit, hardenResponse, requireUser } from "./_security.js";

export default async function handler(req, res) {
  hardenResponse(res);
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!enforceRateLimit(req, res, { key: "closure", limit: 6, windowMs: 15 * 60_000 })) return;
  const auth = await requireUser(req, res);
  if (!auth) return;

  const serviceHeaders = { apikey: auth.secretKey, Authorization: `Bearer ${auth.secretKey}` };
  const [walletResponse, pendingResponse] = await Promise.all([
    fetch(`${auth.supabaseUrl}/rest/v1/wallets?user_id=eq.${encodeURIComponent(auth.user.id)}&select=balance&limit=1`, { headers: serviceHeaders, cache: "no-store" }),
    fetch(`${auth.supabaseUrl}/rest/v1/wallet_transactions?user_id=eq.${encodeURIComponent(auth.user.id)}&status=eq.pending&select=request_id&limit=1`, { headers: serviceHeaders, cache: "no-store" })
  ]);
  if (!walletResponse.ok || !pendingResponse.ok) return res.status(500).json({ error: "Could not complete account safety checks" });
  const wallet = (await walletResponse.json())?.[0];
  const pending = await pendingResponse.json();
  const balance = Number(wallet?.balance || 0);
  const hasPendingTransactions = Array.isArray(pending) && pending.length > 0;
  const previous = auth.user.app_metadata?.account_closure_request || null;

  if (req.method === "GET") {
    return res.status(200).json({ balance, has_pending_transactions: hasPendingTransactions, request: previous });
  }
  if (balance > 0) return res.status(409).json({ error: "Withdraw or use the remaining wallet balance before requesting closure.", balance });
  if (hasPendingTransactions) return res.status(409).json({ error: "Wait for pending transactions to finish before requesting closure." });

  const reason = cleanText(req.body?.reason, 500);
  const confirmation = cleanText(req.body?.confirmation, 30).toUpperCase();
  if (reason.length < 10 || confirmation !== "CLOSE MY ACCOUNT") {
    return res.status(400).json({ error: "Enter a reason and type CLOSE MY ACCOUNT to confirm." });
  }
  const reference = `CLOSE-${Date.now().toString(36).toUpperCase()}-${auth.user.id.slice(0, 6).toUpperCase()}`;
  const update = await fetch(`${auth.supabaseUrl}/auth/v1/admin/users/${auth.user.id}`, {
    method: "PUT",
    headers: { apikey: auth.secretKey, Authorization: `Bearer ${auth.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      app_metadata: {
        ...(auth.user.app_metadata || {}),
        account_closure_request: { reference, reason, status: "pending_review", requested_at: new Date().toISOString() }
      }
    })
  });
  if (!update.ok) return res.status(500).json({ error: "Could not submit the account closure request" });
  return res.status(201).json({ success: true, reference, message: "Account closure request submitted for secure review." });
}
