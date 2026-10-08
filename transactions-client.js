function escapeTransactionText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function transactionStatusLabel(status) {
  const normalized = String(status || "pending").toLowerCase();

  if (normalized === "successful") return "Successful";
  if (normalized === "refunded") return "Failed — Refunded";
  if (normalized === "failed") return "Failed";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

async function refreshSecureTransactions() {
  const transactionsBox = document.querySelector(".transactions");
  const accessToken = localStorage.getItem("lonerpay_access_token");

  if (!transactionsBox || !accessToken) return;

  try {
    const response = await fetch("/api/transactions", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load transactions");
    }

    const transactions = (Array.isArray(data.transactions)
      ? data.transactions
      : []).slice().sort((a, b) => {
        const aTime = Date.parse(a?.created_at || "") || 0;
        const bTime = Date.parse(b?.created_at || "") || 0;
        return bTime - aTime;
      });

    if (!refreshSecureTransactions.requerying) {
      const pending = transactions.filter(transaction =>
        String(transaction.status || "").toLowerCase() === "pending" &&
        /^\d{12}/.test(String(transaction.request_id || ""))
      ).slice(0, 3);
      if (pending.length) {
        refreshSecureTransactions.requerying = true;
        try {
          const results = await Promise.all(pending.map(transaction => fetch("/api/vtpass-requery", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ request_id: transaction.request_id })
          }).then(response => response.json().catch(() => ({})))));
          if (results.some(result => result.resolved)) {
            if (typeof window.refreshSecureWallet === "function") await window.refreshSecureWallet();
            refreshSecureTransactions.requerying = false;
            return refreshSecureTransactions();
          }
        } finally {
          refreshSecureTransactions.requerying = false;
        }
      }
    }

    transactionsBox.innerHTML = "<h2>Recent Transactions</h2>";

    if (!transactions.length) {
      transactionsBox.insertAdjacentHTML(
        "beforeend",
        '<div class="transaction">No transactions yet.</div>'
      );
      return;
    }

    transactions.forEach(transaction => {
      const requestId = String(transaction.request_id || "");
if (requestId.endsWith(":refund")) return; 
      const details = transaction.details || {};
      const phone = details.phone || details.billersCode || "";
      const service = String(transaction.service || "");
const serviceLower = service.toLowerCase();

const serviceName =
  serviceLower === "mtn"
    ? "MTN Airtime"
    : serviceLower === "paystack_wallet_funding"
    ? "Wallet Funding"
    : service; 
      const detailText = phone ? `Phone: ${phone}` : "Secure wallet payment";
      const createdAt = transaction.created_at || "";
      const readableDate = createdAt && !Number.isNaN(Date.parse(createdAt))
        ? new Date(createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })
        : "";

      transactionsBox.insertAdjacentHTML(
        "beforeend",
        `<div class="transaction" data-transaction-date="${escapeTransactionText(createdAt)}" data-receipt-id="${escapeTransactionText(requestId)}">
          <strong>${escapeTransactionText(serviceName)}</strong><br>
          ₦${Number(transaction.amount).toFixed(2)}<br>
          <small>${escapeTransactionText(detailText)}</small><br>
          ${readableDate ? `<small>${escapeTransactionText(readableDate)}</small><br>` : ""}
          <small><strong>Status: ${escapeTransactionText(
            transactionStatusLabel(transaction.status)
          )}</strong></small>
        </div>`
      );
    });
  } catch (error) {
    console.error("Secure transaction history error:", error);
  }
}

window.refreshSecureTransactions = refreshSecureTransactions;
refreshSecureTransactions();
