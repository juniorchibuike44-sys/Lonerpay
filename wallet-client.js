async function refreshSecureWallet() {
  const balanceElement = document.querySelector(".balance h2");
  let accessToken = localStorage.getItem("lonerpay_access_token");
const refreshToken = localStorage.getItem("lonerpay_refresh_token"); 

  const demoButton = Array.from(document.querySelectorAll("button")).find(
    button => button.textContent.includes("Add Demo Funds")
  );

  if (demoButton) {
    demoButton.style.display = "none";
  }

  

  localStorage.removeItem("lonerpay_balance");

  if (!accessToken) {
    window.location.href = "index.html";
    return;
  }

  if (balanceElement) {
    balanceElement.textContent = "Loading...";
  }

  try {
    const response = await fetch("/api/wallet", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });

    const data = await response.json();

    if (response.status === 401) {
    if (!refreshToken) {
        localStorage.removeItem("lonerpay_access_token");
        localStorage.removeItem("lonerpay_refresh_token");
        window.location.href = "index.html";
        return;
    }

    const configResponse = await fetch("/api/config", {
        cache: "no-store"
    });
    const config = await configResponse.json();

    const refreshResponse = await fetch(
        `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: config.supabasePublishableKey
            },
            body: JSON.stringify({
                refresh_token: refreshToken
            })
        }
    );

    const refreshed = await refreshResponse.json();

    if (!refreshResponse.ok || !refreshed.access_token) {
        localStorage.removeItem("lonerpay_access_token");
        localStorage.removeItem("lonerpay_refresh_token");
        window.location.href = "index.html";
        return;
    }

    localStorage.setItem(
        "lonerpay_access_token",
        refreshed.access_token
    );

    if (refreshed.refresh_token) {
        localStorage.setItem(
            "lonerpay_refresh_token",
            refreshed.refresh_token
        );
    }

    return refreshSecureWallet();
    } 

    if (!response.ok) {
      throw new Error(data.error || "Could not load wallet");
    }

    const secureBalance = Number(data.balance);

    if (!Number.isFinite(secureBalance)) {
      throw new Error("Invalid wallet balance");
    }

    if (typeof walletBalance !== "undefined") {
      walletBalance = secureBalance;
    }

    if (balanceElement) {
      balanceElement.textContent = `₦${secureBalance.toFixed(2)}`;
    }
  } catch (error) {
    console.error("Secure wallet error:", error);

    if (balanceElement) {
      balanceElement.textContent = "Unavailable";
    }
  }
}

window.refreshSecureWallet = refreshSecureWallet;
refreshSecureWallet();
function removeDemoFundsControl() {
  document
    .querySelectorAll("button, a, [role='button']")
    .forEach(element => {
      if (element.textContent.includes("Add Demo Funds")) {
        element.remove();
      }
    });
}

removeDemoFundsControl();
setTimeout(removeDemoFundsControl, 500); 
// Open the dedicated gift-card experience instead of the legacy alert-only
// dashboard popup. The page performs no wallet debit until a provider adapter
// is configured and confirms a live quote.
window.openGiftCards = function openGiftCardsPage() {
    window.location.href = "gift-cards.html";
};

window.openFlights = function openFlightsPage() {
    window.location.href = "flights.html";
};

function addFlightsService() {
    const services = Array.from(document.querySelectorAll(".service"));
    if (services.some(service => service.querySelector("h3")?.textContent.trim() === "Flights")) return;

    const giftCards = services.find(service => service.querySelector("h3")?.textContent.trim() === "Gift Cards");
    if (!giftCards) return;

    const flights = document.createElement("div");
    flights.className = "service";
    flights.setAttribute("onclick", "openFlights()");
    flights.innerHTML = "<div>✈️</div><h3>Flights</h3><p>Local & international</p>";
    giftCards.insertAdjacentElement("afterend", flights);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addFlightsService, { once: true });
} else {
    addFlightsService();
}

// Premium dashboard shell. This is intentionally presentation-only: existing
// wallet and payment handlers remain the source of truth for every transaction.
function upgradeDashboardExperience() {
    if (document.getElementById("lp-dashboard-premium")) return;

    const style = document.createElement("style");
    style.id = "lp-dashboard-premium";
    style.textContent = `
      :root{--lp-navy:#061a37;--lp-blue:#0867df;--lp-sky:#eaf4ff;--lp-ink:#11243e;--lp-muted:#6b7b91;--lp-line:#e4ebf3}
      body{background:linear-gradient(180deg,#edf5ff 0,#f6f9fd 330px)!important;color:var(--lp-ink)!important}
      .header{position:sticky!important;top:0;z-index:1000;background:rgba(6,26,55,.96)!important;backdrop-filter:blur(16px);border-radius:0!important;padding:13px 16px!important;box-shadow:0 5px 22px rgba(3,20,46,.14)}
      .header h1{font-size:20px!important;letter-spacing:-.4px}.header>div{display:none!important}
      .lp-head-tools{display:flex!important;align-items:center;gap:9px}.lp-head-btn{position:relative;width:40px;height:40px;border:1px solid rgba(255,255,255,.16);border-radius:14px;background:rgba(255,255,255,.1);color:#fff;font-size:18px;display:grid;place-items:center}.lp-head-btn .dot{position:absolute;right:8px;top:7px;width:7px;height:7px;border-radius:50%;background:#31d89b;border:2px solid #06244d}.lp-avatar{font-size:13px;font-weight:900;background:linear-gradient(135deg,#2b8cff,#74baff)}
      .container{padding:16px 14px 18px!important}.lp-welcome{display:flex;align-items:center;justify-content:space-between;margin:2px 2px 14px}.lp-welcome p{margin:0 0 3px;color:var(--lp-muted);font-size:12px}.lp-welcome h2{margin:0;font-size:21px;letter-spacing:-.5px}.lp-verified{display:flex;align-items:center;gap:5px;color:#07865a;background:#e6f8f1;padding:7px 9px;border-radius:999px;font-size:10px;font-weight:850}
      .balance{background:radial-gradient(circle at 95% 5%,rgba(100,188,255,.75),transparent 34%),linear-gradient(145deg,#07295a,#0871e2)!important;border-radius:25px!important;padding:23px!important;box-shadow:0 18px 36px rgba(8,65,145,.23)!important;margin-bottom:16px!important;border:1px solid rgba(255,255,255,.13)}
      .balance:before{content:'LONERPAY WALLET';display:block;font-size:9px;font-weight:850;letter-spacing:.14em;color:#cbe3ff;margin-bottom:8px}.balance small{font-size:12px!important;color:#d8eaff}.balance h2{font-size:36px!important;letter-spacing:-1.3px!important;margin:7px 0 2px!important}.lp-balance-line{display:flex;align-items:center;gap:8px}.lp-eye{width:32px;height:32px;border:0;border-radius:10px;background:rgba(255,255,255,.12);color:white;font-size:15px}.balance>div:last-child{gap:9px!important;margin-top:19px!important}.balance>div:last-child button{padding:13px 8px!important;border-radius:14px!important;font-size:12px!important}#lpHomeQuickActions{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:8px!important}#lpHomeQuickActions .lpHomeQuick{padding:11px 3px!important;font-size:9px!important}
      .lp-virtual-account{margin:-2px 0 16px;background:#fff;border:1px solid var(--lp-line);border-radius:20px;padding:15px;box-shadow:0 8px 22px rgba(18,48,86,.065)}.lp-va-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.lp-va-head b{font-size:12px;color:var(--lp-ink)}.lp-va-badge{font-size:9px;font-weight:900;padding:5px 8px;border-radius:999px;background:#fff4d6;color:#8a6300}.lp-va-badge.active{background:#e4f8ef;color:#087c55}.lp-va-body{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;background:#f5f9ff;border-radius:15px;padding:13px}.lp-va-bank{font-size:10px;color:var(--lp-muted);margin-bottom:5px}.lp-va-number{font-size:20px;letter-spacing:.07em;color:var(--lp-ink);font-weight:900;line-height:1.15}.lp-va-name{font-size:9px;color:#65758b;margin-top:5px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lp-va-copy{border:0;background:var(--lp-blue);color:#fff;border-radius:12px;padding:10px 12px;font-size:10px;font-weight:900}.lp-va-message{font-size:11px;line-height:1.5;color:var(--lp-muted);background:#f7f9fc;border-radius:14px;padding:12px}.lp-va-message strong{display:block;color:var(--lp-ink);margin-bottom:2px}
      .lp-tools{margin:0 0 16px}.lp-search-wrap{position:relative}.lp-search-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:15px}.lp-search{width:100%;border:1px solid var(--lp-line);border-radius:16px;padding:13px 14px 13px 41px;background:#fff;color:var(--lp-ink);outline:0;box-shadow:0 5px 16px rgba(19,45,80,.04)}.lp-search:focus{border-color:#4b9af2;box-shadow:0 0 0 3px rgba(8,103,223,.09)}
      .lp-categories{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:10px 1px 1px}.lp-categories::-webkit-scrollbar{display:none}.lp-category{flex:0 0 auto;border:1px solid var(--lp-line);background:#fff;color:#627188;border-radius:999px;padding:8px 12px;font-size:11px;font-weight:800}.lp-category.active{background:var(--lp-navy);border-color:var(--lp-navy);color:#fff}
      .lp-services-title{display:flex;align-items:end;justify-content:space-between;margin:18px 2px 11px}.lp-services-title h2{font-size:19px;margin:0}.lp-services-title span{font-size:11px;color:var(--lp-muted)}.container>h2{display:none!important}
      #lpHomeServicesHead{display:none!important}
      .services{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:9px!important}.service{position:relative;min-width:0;min-height:105px!important;padding:13px 4px 10px!important;border-radius:18px!important;border:1px solid #e4ebf3!important;box-shadow:0 7px 18px rgba(18,48,86,.055)!important;background:#fff!important;justify-content:flex-start!important}.service>div:first-child{display:grid;place-items:center;width:42px;height:42px;margin:0 auto 7px!important;border-radius:14px;background:linear-gradient(145deg,#eaf4ff,#f8fbff);font-size:21px!important;box-shadow:inset 0 0 0 1px #e2ecf7}.service h3{font-size:11px!important;line-height:1.15;margin:2px 0!important;white-space:normal}.service p{display:none}.service.lp-featured:after{content:'NEW';position:absolute;right:4px;top:5px;padding:3px 5px;border-radius:999px;background:#e7f8f1;color:#07865a;font-size:7px;font-weight:900;letter-spacing:.05em}.service.lp-hidden{display:none!important}
      .lp-value{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:20px 0 4px}.lp-value-card{background:#fff;border:1px solid var(--lp-line);border-radius:17px;padding:13px 8px;text-align:center;min-width:0}.lp-value-card i{font-style:normal;font-size:20px}.lp-value-card b{display:block;font-size:10px;margin:6px 0 2px}.lp-value-card span{display:block;font-size:8px;color:var(--lp-muted);line-height:1.35}.lp-security{display:flex;align-items:center;gap:11px;margin:13px 0 6px;background:linear-gradient(135deg,#061d3d,#0a3568);color:#fff;border-radius:18px;padding:14px}.lp-security-icon{width:38px;height:38px;flex:0 0 auto;display:grid;place-items:center;background:rgba(255,255,255,.11);border-radius:13px;font-size:19px}.lp-security b{display:block;font-size:12px}.lp-security span{display:block;color:#bdd2eb;font-size:9px;margin-top:2px;line-height:1.4}
      .lp-toast{position:fixed;z-index:10000;left:50%;bottom:82px;width:calc(100% - 28px);max-width:520px;transform:translate(-50%,130%);opacity:0;background:#071a35;color:#fff;border-radius:15px;padding:13px 15px;font-size:12px;font-weight:700;box-shadow:0 13px 34px rgba(0,0,0,.25);transition:.24s}.lp-toast.show{transform:translate(-50%,0);opacity:1}
      .lp-carousel-wrap{margin-bottom:15px!important}.lp-slide{border-radius:22px!important}.lp-bottom-nav{height:70px!important;border-radius:20px 20px 0 0;border-top:0!important;box-shadow:0 -8px 25px rgba(16,42,76,.09)!important}.lp-nav-item{font-size:9px!important}.lp-nav-item span{font-size:19px!important}
      @media(max-width:370px){.services{grid-template-columns:repeat(3,minmax(0,1fr))!important}.lp-verified{display:none}.balance h2{font-size:32px!important}}
    `;
    document.head.appendChild(style);

    const header = document.querySelector(".header");
    if (header) {
        const tools = document.createElement("div");
        tools.className = "lp-head-tools";
        tools.innerHTML = '<button class="lp-head-btn" type="button" id="lpNotify" aria-label="Notifications">🔔<span class="dot"></span></button><button class="lp-head-btn lp-avatar" type="button" id="lpProfile" aria-label="Open profile">LP</button>';
        header.appendChild(tools);
    }

    const container = document.querySelector(".container");
    const balance = document.querySelector(".balance");
    const services = document.querySelector(".services");
    if (!container || !balance || !services) return;

    const welcome = document.createElement("section");
    welcome.className = "lp-welcome";
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    welcome.innerHTML = `<div><p>${greeting}</p><h2 id="lpCustomerName">Welcome back 👋</h2></div><span class="lp-verified">✓ Secure</span>`;
    container.insertBefore(welcome, balance);

    const virtualAccount = document.createElement("section");
    virtualAccount.className = "lp-virtual-account";
    virtualAccount.id = "lpVirtualAccount";
    virtualAccount.innerHTML = '<div class="lp-va-head"><b>Dedicated account</b><span class="lp-va-badge">Loading</span></div><div class="lp-va-message">Loading your virtual account…</div>';
    balance.insertAdjacentElement("afterend", virtualAccount);

    const balanceHeading = balance.querySelector("h2");
    if (balanceHeading) {
        document.getElementById("lpBalancePrivacyBtn")?.remove();
        const line = document.createElement("div");
        line.className = "lp-balance-line";
        balanceHeading.replaceWith(line);
        line.appendChild(balanceHeading);
        const eye = document.createElement("button");
        eye.type = "button"; eye.className = "lp-eye"; eye.setAttribute("aria-label", "Hide balance"); eye.textContent = "◉";
        let hidden = localStorage.getItem("lp_hide_balance") === "1";
        let actual = balanceHeading.textContent;
        const paintBalance = () => { if (!hidden) actual = balanceHeading.textContent === "••••••" ? actual : balanceHeading.textContent; balanceHeading.textContent = hidden ? "••••••" : actual; eye.textContent = hidden ? "○" : "◉"; eye.setAttribute("aria-label", hidden ? "Show balance" : "Hide balance"); };
        let repainting = false;
        new MutationObserver(() => {
            if (repainting || balanceHeading.textContent === "••••••") return;
            actual = balanceHeading.textContent;
            if (hidden) { repainting = true; balanceHeading.textContent = "••••••"; repainting = false; }
        }).observe(balanceHeading,{childList:true,characterData:true,subtree:true});
        eye.onclick = () => { actual = balanceHeading.textContent === "••••••" ? actual : balanceHeading.textContent; hidden = !hidden; localStorage.setItem("lp_hide_balance", hidden ? "1" : "0"); paintBalance(); };
        line.appendChild(eye); paintBalance();
    }

    const tools = document.createElement("section");
    tools.className = "lp-tools";
    tools.innerHTML = '<div class="lp-search-wrap"><span class="lp-search-icon">⌕</span><input class="lp-search" id="lpServiceSearch" type="search" placeholder="Search payments and services" aria-label="Search services"></div><div class="lp-categories"><button class="lp-category active" data-category="all">All</button><button class="lp-category" data-category="bills">Bills</button><button class="lp-category" data-category="money">Money</button><button class="lp-category" data-category="lifestyle">Lifestyle</button><button class="lp-category" data-category="smart">Smart tools</button></div>';
    const title = container.querySelector(":scope > h2");
    const serviceTitle = document.createElement("div");
    serviceTitle.className = "lp-services-title";
    serviceTitle.innerHTML = '<h2>Explore services</h2><span>Everything in one place</span>';
    container.insertBefore(tools, title || services);
    container.insertBefore(serviceTitle, services);

    const categoryMap = {"Airtime":"bills","Data":"bills","Electricity":"bills","TV":"bills","Education":"lifestyle","Transfer":"money","Bet Funding":"lifestyle","Gift Cards":"lifestyle","Flights":"lifestyle","AI Tips":"smart"};
    const cards = Array.from(services.querySelectorAll(".service"));
    cards.forEach(card => {
        const name = card.querySelector("h3")?.textContent.trim() || "";
        card.dataset.category = categoryMap[name] || "all";
        card.dataset.name = `${name} ${card.querySelector("p")?.textContent || ""}`.toLowerCase();
        if (["Flights","Gift Cards"].includes(name)) card.classList.add("lp-featured");
    });

    let selected = "all";
    const search = tools.querySelector("#lpServiceSearch");
    const filterCards = () => { const q = search.value.trim().toLowerCase(); cards.forEach(card => card.classList.toggle("lp-hidden", !(selected === "all" || card.dataset.category === selected) || !card.dataset.name.includes(q))); };
    tools.querySelectorAll(".lp-category").forEach(button => button.onclick = () => { tools.querySelectorAll(".lp-category").forEach(x => x.classList.remove("active")); button.classList.add("active"); selected = button.dataset.category; filterCards(); });
    search.addEventListener("input", filterCards);

    const value = document.createElement("section");
    value.className = "lp-value";
    value.innerHTML = '<div class="lp-value-card"><i>⚡</i><b>Fast payments</b><span>Simple everyday transactions</span></div><div class="lp-value-card"><i>🧾</i><b>Clear records</b><span>Track activity and receipts</span></div><div class="lp-value-card"><i>🎧</i><b>Real support</b><span>Help when you need it</span></div>';
    const security = document.createElement("section");
    security.className = "lp-security";
    security.innerHTML = '<div class="lp-security-icon">🛡️</div><div><b>Your security comes first</b><span>LonerPay will never ask you to share your password, OTP or payment PIN.</span></div>';
    services.insertAdjacentElement("afterend", value);
    value.insertAdjacentElement("afterend", security);

    const toast = document.createElement("div"); toast.className = "lp-toast"; toast.id = "lpDashboardToast"; document.body.appendChild(toast);
    const showToast = message => { toast.textContent = message; toast.classList.add("show"); clearTimeout(showToast.t); showToast.t = setTimeout(() => toast.classList.remove("show"), 3500); };
    document.getElementById("lpNotify")?.addEventListener("click", () => showToast("You're all caught up. No new notifications."));
    document.getElementById("lpProfile")?.addEventListener("click", () => location.href = "profile.html");

    // Add PHED to the professional electricity sheet without duplicating the
    // large dashboard implementation. VTpass service ID: portharcourt-electric.
    const openElectricity = window.buyElectricity;
    if (typeof openElectricity === "function" && !openElectricity.lpPhedReady) {
        const enhancedElectricity = function () {
            openElectricity();
            setTimeout(() => {
                const select = document.querySelector(".lp-elec-provider");
                if (select && !select.querySelector('option[value="portharcourt-electric"]')) {
                    const option = document.createElement("option");
                    option.value = "portharcourt-electric";
                    option.textContent = "Port Harcourt Electric (PHED)";
                    select.appendChild(option);
                }
            }, 0);
        };
        enhancedElectricity.lpPhedReady = true;
        window.buyElectricity = enhancedElectricity;
    }

    const token = localStorage.getItem("lonerpay_access_token");
    if (token) fetch("/api/virtual-account", {headers:{Authorization:`Bearer ${token}`},cache:"no-store"}).then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || "Unable to load virtual account");
        const account = data.virtual_account;
        const badge = virtualAccount.querySelector(".lp-va-badge");
        const isReady = account?.account_number && account?.bank_name && ["active","assigned","success"].includes(String(account?.assignment_status || account?.status || "").toLowerCase());
        if (isReady) {
            badge.textContent = "Active"; badge.classList.add("active");
            virtualAccount.innerHTML = `<div class="lp-va-head"><b>Dedicated account</b><span class="lp-va-badge active">Active</span></div><div class="lp-va-body"><div style="min-width:0"><div class="lp-va-bank">${escapeDashboardText(account.bank_name)}</div><div class="lp-va-number">${escapeDashboardText(account.account_number)}</div><div class="lp-va-name">${escapeDashboardText(account.account_name || "LonerPay customer")}</div></div><button class="lp-va-copy" type="button">Copy</button></div>`;
            virtualAccount.querySelector(".lp-va-copy").onclick = async () => {
                try { await navigator.clipboard.writeText(String(account.account_number)); showToast("Account number copied."); }
                catch { showToast(`Account number: ${account.account_number}`); }
            };
        } else if (account) {
            badge.textContent = "Pending";
            virtualAccount.querySelector(".lp-va-message").innerHTML = "<strong>Virtual account pending</strong>Your bank account details will appear here automatically after Paystack completes the assignment.";
        } else {
            badge.textContent = "Not created";
            virtualAccount.querySelector(".lp-va-message").innerHTML = "<strong>No virtual account yet</strong>Create your dedicated account from your profile to receive wallet transfers.";
        }
    }).catch(() => {
        virtualAccount.querySelector(".lp-va-badge").textContent = "Unavailable";
        virtualAccount.querySelector(".lp-va-message").innerHTML = "<strong>Account details unavailable</strong>Pull down to refresh or try again shortly.";
    });
    if (token) fetch("/api/profile", {headers:{Authorization:`Bearer ${token}`},cache:"no-store"}).then(r => r.ok ? r.json() : null).then(data => {
        const name = String(data?.name || data?.full_name || "").trim().split(/\s+/)[0];
        if (name) { document.getElementById("lpCustomerName").textContent = `${name} 👋`; document.querySelector(".lp-avatar").textContent = name.slice(0,2).toUpperCase(); }
    }).catch(() => {});
}

function escapeDashboardText(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
}

// dashboard.html installs its original quick actions during DOMContentLoaded.
// Run immediately afterwards so we enhance the final wallet structure instead
// of being mistaken for one of those original action buttons.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(upgradeDashboardExperience, 0), { once: true });
} else {
    setTimeout(upgradeDashboardExperience, 0);
}
