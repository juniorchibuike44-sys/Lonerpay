(() => {
  const TOKEN_KEY = "lonerpay_access_token";
  const READY_EVENT = "lonerpay:dashboard-ready";
  let activeRefresh = null;
  let lastRefreshAt = 0;
  let retryTimer = null;

  const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  async function waitForSession(timeout = 4000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) return token;
      await delay(100);
    }
    return "";
  }

  async function runDashboardRefresh(reason = "startup", force = false) {
    const now = Date.now();
    if (!force && now - lastRefreshAt < 750) return activeRefresh;
    if (activeRefresh) return activeRefresh;

    activeRefresh = (async () => {
      const token = await waitForSession();
      if (!token || token !== localStorage.getItem(TOKEN_KEY)) return;

      const tasks = [];
      if (typeof window.refreshSecureWallet === "function") {
        tasks.push(Promise.resolve().then(() => window.refreshSecureWallet()));
      }
      if (typeof window.refreshSecureTransactions === "function") {
        tasks.push(Promise.resolve().then(() => window.refreshSecureTransactions()));
      }

      await Promise.allSettled(tasks);
      if (token !== localStorage.getItem(TOKEN_KEY)) return;

      lastRefreshAt = Date.now();
      window.dispatchEvent(new CustomEvent(READY_EVENT, {
        detail: { reason, refreshedAt: lastRefreshAt }
      }));
    })().finally(() => {
      activeRefresh = null;
    });

    return activeRefresh;
  }

  function scheduleStartupRefresh() {
    clearTimeout(retryTimer);
    runDashboardRefresh("startup", true);
    retryTimer = setTimeout(() => runDashboardRefresh("startup-retry", true), 1200);
  }

  window.refreshLonerPayDashboard = reason =>
    runDashboardRefresh(reason || "manual", true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleStartupRefresh, { once: true });
  } else {
    scheduleStartupRefresh();
  }

  window.addEventListener("load", () => runDashboardRefresh("window-load", true), { once: true });
  window.addEventListener("pageshow", event => {
    if (event.persisted) runDashboardRefresh("page-restored", true);
  });
  window.addEventListener("focus", () => runDashboardRefresh("focus"));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) runDashboardRefresh("visible", true);
  });
  window.addEventListener("storage", event => {
    if (!event.key || event.key === TOKEN_KEY) scheduleStartupRefresh();
  });
})();