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

    const transactions = Array.isArray(data.transactions)
      ? data.transactions
      : [];

    transactionsBox.innerHTML = "<h2>Recent Transactions</h2>";

    if (!transactions.length) {
      transactionsBox.insertAdjacentHTML(
        "beforeend",
        '<div class="transaction">No transactions yet.</div>'
      );
      return;
    }

    transactions.forEach(transaction => {
      const details = transaction.details || {};
      const phone = details.phone || details.billersCode || "";
      const service = String(transaction.service || "Payment");
      const serviceName = service.toLowerCase() === "mtn"
        ? "MTN Airtime"
        : service;
      const detailText = phone ? `Phone: ${phone}` : "Secure wallet payment";

      transactionsBox.insertAdjacentHTML(
        "beforeend",
        `<div class="transaction">
          <strong>${escapeTransactionText(serviceName)}</strong><br>
          ₦${Number(transaction.amount).toFixed(2)}<br>
          <small>${escapeTransactionText(detailText)}</small><br>
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
