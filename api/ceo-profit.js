import { enforceRateLimit, hardenResponse, requireUser } from "./_security.js";
import { pairgateRequest } from "./_pairgate.js";

const CEO_EMAIL = "juniorchibuike44@gmail.com";

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function dayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export default async function handler(req, res) {
  hardenResponse(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!enforceRateLimit(req, res, { key: "ceo-profit", limit: 30, windowMs: 60_000 })) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  if (String(auth.user.email || "").trim().toLowerCase() !== CEO_EMAIL) {
    return res.status(403).json({ error: "CEO access only" });
  }

  const days = Math.min(90, Math.max(1, Number(req.query?.days || 30)));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const headers = {
    apikey: auth.secretKey,
    Authorization: `Bearer ${auth.secretKey}`
  };

  try {
    const query = new URLSearchParams({
      status: "eq.successful",
      transaction_type: "eq.debit",
      created_at: `gte.${since}`,
      service: "in.(mtn,airtel,glo,etisalat,9mobile)",
      select: "request_id,service,amount,status,details,created_at",
      order: "created_at.desc",
      limit: "1000"
    });
    const transactionResponse = await fetch(
      `${auth.supabaseUrl}/rest/v1/wallet_transactions?${query}`,
      { headers, cache: "no-store" }
    );
    const rows = await transactionResponse.json().catch(() => []);
    if (!transactionResponse.ok) {
      return res.status(502).json({ error: "Could not load profit records" });
    }

    const transactions = (Array.isArray(rows) ? rows : [])
      .filter(row => String(row?.details?.provider || "").toLowerCase() === "pairgate")
      .map(row => {
        const sale = money(row.details?.sale_amount ?? row.amount) ?? 0;
        const cost = money(row.details?.provider_cost);
        const profit = money(row.details?.gross_profit ?? (cost === null ? null : sale - cost));
        return {
          reference: row.request_id,
          network: String(row.service || "").toUpperCase().replace("ETISALAT", "9MOBILE"),
          sale,
          provider_cost: cost,
          gross_profit: profit,
          date: row.created_at
        };
      });

    const dailyMap = new Map();
    for (const item of transactions) {
      const day = dayKey(item.date);
      const current = dailyMap.get(day) || { date: day, transactions: 0, sales: 0, provider_cost: 0, gross_profit: 0, unpriced: 0 };
      current.transactions += 1;
      current.sales += item.sale;
      if (item.provider_cost === null || item.gross_profit === null) current.unpriced += 1;
      else {
        current.provider_cost += item.provider_cost;
        current.gross_profit += item.gross_profit;
      }
      dailyMap.set(day, current);
    }

    const priced = transactions.filter(item => item.provider_cost !== null && item.gross_profit !== null);
    const totals = {
      transactions: transactions.length,
      sales: money(transactions.reduce((sum, item) => sum + item.sale, 0)),
      provider_cost: money(priced.reduce((sum, item) => sum + item.provider_cost, 0)),
      gross_profit: money(priced.reduce((sum, item) => sum + item.gross_profit, 0)),
      unpriced: transactions.length - priced.length
    };

    let providerBalance = null;
    try {
      const balanceResult = await pairgateRequest("/wallet/balance", { method: "GET" });
      const value = balanceResult.data?.data?.balance ?? balanceResult.data?.balance;
      providerBalance = money(value);
    } catch {
      providerBalance = null;
    }

    return res.status(200).json({
      period_days: days,
      generated_at: new Date().toISOString(),
      provider_balance: providerBalance,
      totals,
      daily: [...dailyMap.values()].sort((a, b) => b.date.localeCompare(a.date)).map(day => ({
        ...day,
        sales: money(day.sales),
        provider_cost: money(day.provider_cost),
        gross_profit: money(day.gross_profit)
      })),
      transactions: transactions.slice(0, 100)
    });
  } catch (error) {
    return res.status(500).json({ error: "Could not prepare CEO profit report", message: error.message });
  }
}
