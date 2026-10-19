(function installLonerPayDataClient() {
  const serviceIDs = {
    MTN: "mtn-data",
    Airtel: "airtel-data",
    Glo: "glo-data",
    "9mobile": "etisalat-data"
  };

  function getAccessToken() {
    return localStorage.getItem("lonerpay_access_token");
  }

  const planRequests = new Map();
  let catalogueCooldownUntil = 0;
  const PLAN_FRESH_MS = 10 * 60_000;
  const PLAN_DISPLAY_MS = 24 * 60 * 60_000;
  const planKey=network=>`lonerpay_data_plans_pairgate_v3_${String(network).toLowerCase()}`;
  function markPlans(plans,partial,refreshedTypes=[]){
    Object.defineProperties(plans,{partial:{value:partial===true},refreshedTypes:{value:refreshedTypes}});
    return plans;
  }
  function keepFullCatalogue(network,incoming,{partial,savedAt=Date.now(),refreshedTypes=[]}={}){
    const previous=cachedDataPlans(network,PLAN_DISPLAY_MS);
    // Only a complete response may replace the whole catalogue. Partial results
    // refresh successful families and keep saved plans from missing families.
    let displayed=incoming;
    if(partial&&previous){
      const refreshed=new Set(refreshedTypes);
      const merged=new Map(previous.filter(p=>!p.planType||!refreshed.has(p.planType)).map(p=>[p.code,p]));
      for(const plan of incoming)merged.set(plan.code,plan);
      displayed=[...merged.values()].sort((a,b)=>a.amount-b.amount);
    }
    // Do not renew the age or downgrade the quality of a complete saved list.
    if(!partial||!previous){
      try{localStorage.setItem(planKey(network),JSON.stringify({savedAt,partial:partial===true,plans:displayed}));}catch(_){}
    }
    return markPlans(displayed,partial,refreshedTypes);
  }
  function cachedDataPlans(network, maxAge = PLAN_FRESH_MS) {
    try {
      const cached = JSON.parse(localStorage.getItem(`lonerpay_data_plans_pairgate_v3_${String(network).toLowerCase()}`) || "null");
      if (cached?.savedAt && Date.now() - cached.savedAt < maxAge &&
          Array.isArray(cached.plans) && cached.plans.length &&
          cached.plans.every(p => p.network === network && p.serviceID === serviceIDs[network] &&
            p.code && Number.isFinite(Number(p.amount)) && Number(p.amount) > 0)) {
        return markPlans(cached.plans,cached.partial);
      }
    } catch (_) {}
    return null;
  }
  let snapshotRequest = null;
  let snapshotLoadedAt = 0;
  function warmDataPlans() {
    const accessToken = getAccessToken();
    if (!accessToken || Date.now() - snapshotLoadedAt < PLAN_FRESH_MS) return Promise.resolve();
    if (snapshotRequest) return snapshotRequest;
    snapshotRequest = (async () => {
      try {
        const response = await fetch("/api/variations?serviceID=mtn-data&snapshot=1", {
          headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
          signal: AbortSignal.timeout(6000)
        });
        if (!response.ok || getAccessToken() !== accessToken) return;
        const data = await response.json();
        for (const [network, serviceID] of Object.entries(serviceIDs)) {
          const saved = data.catalogues?.[serviceID];
          if (!saved || !Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt >= PLAN_DISPLAY_MS) continue;
          const plans = (saved.variations || []).filter(p => p.code && Number.isFinite(Number(p.amount)) && Number(p.amount) > 0)
            .map(p => ({ code: String(p.code), name: String(p.name), amount: Number(p.amount), planType:p.planType||null, network, serviceID }));
          if (!plans.length) continue;
          try {
            // A snapshot has no proof of complete category coverage. It must not
            // replace a usable local catalogue merely because its timestamp is newer.
            if(!cachedDataPlans(network,PLAN_DISPLAY_MS))keepFullCatalogue(network,plans,{partial:true,savedAt:saved.savedAt});
          } catch (_) {}
        }
        snapshotLoadedAt = Date.now();
      } catch (_) {
        // Warming saved plans must never block normal catalogue loading.
      }
    })().finally(() => { snapshotRequest = null; });
    return snapshotRequest;
  }
  function loadDataPlans(network) {
    const serviceID = serviceIDs[network], accessToken = getAccessToken();
    if (!serviceID) return Promise.reject(new Error("Select a valid network."));
    if (!accessToken) return Promise.reject(new Error("Please log in again."));
    const cached = cachedDataPlans(network);
    if (cached && !cached.partial) return Promise.resolve(cached);
    if (Date.now() < catalogueCooldownUntil) return Promise.reject(new Error("Data plans are busy. Please wait a minute before trying again."));
    const key = accessToken + ":" + network;
    if (planRequests.has(key)) return planRequests.get(key);
    const request = (async () => {
      await warmDataPlans();
      const warmed = cachedDataPlans(network);
      if (warmed && !warmed.partial) return warmed;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`/api/variations?serviceID=${encodeURIComponent(serviceID)}`, {
          headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: controller.signal
        });
        const data = await response.json();
        if(getAccessToken()!==accessToken)throw Object.assign(new Error("Please log in again."),{auth:true});
        if (response.status === 429) {
          catalogueCooldownUntil = Date.now() + Math.max(1, Number(data.retryAfter) || 60) * 1000;
        }
        if (!response.ok) {
          // Never hide an expired login behind cached catalogue data.
          if (response.status === 401 || response.status === 403) throw Object.assign(new Error("Please log in again."), { auth: true });
          throw new Error(data.error || data.message || "Could not load data plans.");
        }
        const plans = (Array.isArray(data.variations) ? data.variations : [])
          .filter(item => item && item.code && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0)
          .map(item => ({ code: String(item.code), name: String(item.name || "Data plan"),
            amount: Number(item.amount), planType:item.planType||null, network, serviceID }));
        if (!plans.length) throw new Error("No data plans are available for this network.");
        return keepFullCatalogue(network,plans,{partial:data.partial===true,refreshedTypes:Array.isArray(data.refreshedTypes)?data.refreshedTypes:[]});
      } catch (error) {
        const fallback = !error.auth && cachedDataPlans(network, PLAN_DISPLAY_MS);
        if (fallback) return fallback;
        if(error.auth)throw error;
        throw new Error(error.name === "AbortError" ? "Plans could not be loaded. Please try again." : error.message);
      } finally { clearTimeout(timeout); }
    })();
    planRequests.set(key, request);
    request.finally(() => planRequests.delete(key)).catch(() => {});
    return request;
  }
  // Read saved catalogues once on dashboard entry; this sends no provider requests.
  warmDataPlans();

  async function purchaseData({
    network,
    phone,
    variationCode,
    amount,
    pin
  }) {
    const serviceID = serviceIDs[network];

    const phoneNumber =
      String(phone || "").trim();

    const cleanPin =
      String(pin || "").trim();

    const numericAmount =
      Number(amount);

    if (!serviceID) {
      throw new Error("Select a valid network.");
    }

    if (!/^\d{11,12}$/.test(phoneNumber)) {
      throw new Error(
        "Enter a valid phone number."
      );
    }

    if (!variationCode) {
      throw new Error(
        "Select a valid data plan."
      );
    }

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      throw new Error(
        "Invalid data plan amount."
      );
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      throw new Error(
        "Enter your 4-digit payment PIN."
      );
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      throw new Error(
        "Please log in again."
      );
    }

    const response =
      await fetch("/api/secure-pay", {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${accessToken}`
        },

        body: JSON.stringify({
          serviceID: serviceID,

          billersCode:
            phoneNumber,

          variation_code:
            String(variationCode),

          amount:
            numericAmount,

          phone:
            phoneNumber,

          pin:
            cleanPin
        })
      });

    let data =
      await response.json();

    if (
      typeof window.refreshSecureWallet ===
      "function"
    ) {
      await window.refreshSecureWallet();
    }

    if (
      typeof window.refreshSecureTransactions ===
      "function"
    ) {
      await window.refreshSecureTransactions();
    }

    if (response.ok && (data.pending || String(data.code) === "099") && window.waitForSecurePayment) {
      const confirmation = await window.waitForSecurePayment(data.request_id);
      if (confirmation.status === "successful") data = { ...data, pending: false, code: "000", content: { transactions: { status: "delivered" } } };
      if (confirmation.status === "refunded" || confirmation.status === "failed") {
        const error = new Error(confirmation.status === "refunded" ? "Purchase failed. Your wallet was refunded." : "Purchase failed. Check Transactions for details.");
        error.refunded = confirmation.status === "refunded";
        throw error;
      }
    }

    if (!response.ok) {
      const error =
        new Error(
          data.error ||
          data.message ||
          "Payment failed."
        );

      error.refunded =
        Boolean(data.refunded);

      error.refund_error =
        data.refund_error || "";

      throw error;
    }

    return data;
  }

  const escapeText = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);

  const money = value => `₦${Number(value || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

  function planPeriod(name) {
    const text = String(name || "").toLowerCase();
    if (/monthly|month|(?:28|30|31)\s*days?/.test(text)) return "Monthly";
    if (/weekly|week|7\s*days?/.test(text)) return "Weekly";
    if (/2\s*days?/.test(text)) return "2 Days";
    if (/daily|(?:^|\D)1\s*day|24\s*hours?/.test(text)) return "Daily";
    return "Other";
  }

  // The dashboard used to show a hard-coded MTN preview that could never
  // complete payment. This catalogue uses the provider’s saved plan IDs.
  window.buyData = function buyLiveData() {
    document.getElementById("lpLiveData")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "lpLiveData";
    overlay.innerHTML = `
      <style>
        #lpLiveData{position:fixed;inset:0;z-index:28000;background:rgba(3,15,35,.7);display:flex;align-items:flex-end;justify-content:center;font-family:Inter,system-ui,sans-serif}
        #lpLiveData *{box-sizing:border-box}.ld-sheet{width:100%;max-width:560px;max-height:94vh;display:flex;flex-direction:column;background:#faf8f2;border-radius:28px 28px 0 0;overflow:hidden}
        .ld-head{background:linear-gradient(135deg,#2b271f,#936514);color:#fff;padding:16px 18px 19px}.ld-handle{width:44px;height:5px;border-radius:9px;background:rgba(255,255,255,.35);margin:0 auto 13px}.ld-top{display:flex;align-items:center;justify-content:space-between}.ld-top h2{margin:0;font-size:22px}.ld-top p{margin:3px 0 0;color:#ead7ab;font-size:12px}.ld-close{width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.13);color:#fff;font-size:23px}
        .ld-body{padding:15px;overflow:auto}.ld-label{display:block;margin:2px 0 8px;color:#66768b;font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.ld-networks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.ld-network,.ld-filter{border:1px solid #dfe7f0;background:#fff;color:#536277;border-radius:13px;padding:10px 4px;font-size:11px;font-weight:850}.ld-network.on,.ld-filter.on{border-color:#936514;background:#f3ecd9;color:#0860c7}.ld-filters{display:flex;gap:7px;overflow:auto;padding:13px 0 10px;scrollbar-width:none}.ld-filter{flex:0 0 auto;border-radius:999px;padding:8px 13px}.ld-state{padding:28px 15px;text-align:center;background:#fff;border:1px dashed #cfdae8;border-radius:17px;color:#66768b;font-size:13px}.ld-plans{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ld-plan{position:relative;min-height:103px;text-align:left;border:1px solid #dfe7f0;background:#fff;border-radius:17px;padding:13px}.ld-plan.on{border:2px solid #936514;background:#f3f8ff}.ld-plan b{display:block;color:#13253d;font-size:13px;line-height:1.35}.ld-plan strong{display:block;color:#936514;font-size:16px;margin-top:11px}.ld-checkout{border-top:1px solid #e3eaf2;background:#fff;padding:13px 15px calc(15px + env(safe-area-inset-bottom))}.ld-input{width:100%;border:1px solid #d7e0eb;border-radius:13px;padding:13px 14px;outline:0}.ld-summary{min-height:17px;margin:7px 2px 10px;color:#6a788c;font-size:11px}.ld-primary{width:100%;border:0;border-radius:14px;padding:14px;background:#936514;color:#fff;font-weight:900}.ld-primary:disabled{opacity:.45}.ld-error{display:none;margin:10px 0 0;padding:10px 11px;border:1px solid #fecdd3;background:#fff1f2;color:#b42318;border-radius:12px;font-size:12px}.ld-review{padding:18px;overflow:auto}.ld-card{background:#fff;border:1px solid #e1e8f0;border-radius:18px;padding:6px 14px}.ld-row{display:flex;justify-content:space-between;gap:15px;padding:11px 0;border-bottom:1px solid #ebf0f5;font-size:13px}.ld-row:last-child{border:0}.ld-pin{margin-top:15px;text-align:center;letter-spacing:9px;font-size:19px}.ld-secondary{width:100%;border:0;background:transparent;padding:13px;color:#536277;font-weight:800}
        .ld-skeleton{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;grid-column:1/-1}.ld-skeleton span{height:103px;border-radius:17px;background:linear-gradient(90deg,#e8dfcf,#f6f8fc,#e8dfcf);background-size:200% 100%;animation:ld-shimmer 1.2s ease-in-out infinite}@keyframes ld-shimmer{to{background-position:-200% 0}}@media(prefers-reduced-motion:reduce){.ld-skeleton span{animation:none}}
        @media(max-width:370px){.ld-plans{grid-template-columns:1fr}.ld-network{font-size:10px}}
      </style>
      <div class="ld-sheet"><div class="ld-head"><div class="ld-handle"></div><div class="ld-top"><div><h2>Buy Data</h2><p>Live bundles from your selected network</p></div><button class="ld-close" type="button">×</button></div></div>
      <div class="ld-body"><div class="lp-mobile-promo"><small>LONERPAY DATA</small><h3>More data.<br>More possibilities.</h3><p>Find the right bundle for your day, week or month.</p></div><span class="ld-label">Select network</span><div class="ld-networks">${Object.keys(serviceIDs).map((name,index)=>`<button class="ld-network ${index===0?"on":""}" data-network="${name}" type="button">${name}</button>`).join("")}</div><label class="ld-label" for="lpDataRecipient">Recipient phone number</label><input id="lpDataRecipient" class="ld-input ld-phone" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="Phone number • 08012345678"><div class="ld-filters">${["All","Daily","2 Days","Weekly","Monthly","Other"].map((name,index)=>`<button class="ld-filter ${index===0?"on":""}" data-filter="${name}" type="button">${name}</button>`).join("")}</div><span class="ld-label">Data bundles</span><div class="ld-plans"><div class="ld-skeleton" role="status" aria-label="Loading data plans"><span></span><span></span><span></span><span></span></div></div></div>
      <div class="ld-checkout"><div class="ld-summary">Select a data bundle to continue</div><button class="ld-primary ld-continue" type="button" disabled>Continue</button><div class="ld-error"></div></div></div>`;
    document.body.appendChild(overlay);

    let network = "MTN", filter = "All", plans = [], selected = null;
    const grid = overlay.querySelector(".ld-plans"), summary = overlay.querySelector(".ld-summary"), next = overlay.querySelector(".ld-continue"), error = overlay.querySelector(".ld-error");
    const showError = message => { error.textContent = message; error.style.display = "block"; };
    const close = () => { if(overlay.dataset.paymentBusy === "1") return; const pin=overlay.querySelector(".ld-pin"); if(pin) pin.value=""; overlay.remove(); };
    overlay.querySelector(".ld-close").onclick = close;

    function renderPlans() {
      const availablePeriods = new Set(plans.map(plan => planPeriod(plan.name)));
      overlay.querySelectorAll(".ld-filter").forEach(button => {
        const available = button.dataset.filter === "All" || availablePeriods.has(button.dataset.filter);
        button.hidden = !available;
      });
      if (filter !== "All" && !availablePeriods.has(filter)) {
        filter = "All";
        overlay.querySelectorAll(".ld-filter").forEach(button => button.classList.toggle("on", button.dataset.filter === "All"));
      }
      const visible = plans.filter(plan => filter === "All" || planPeriod(plan.name) === filter);
      grid.innerHTML = visible.length ? visible.map(plan => `<button class="ld-plan ${selected?.code===plan.code?"on":""}" data-code="${escapeText(plan.code)}" type="button"><b>${escapeText(plan.name)}</b><strong>${money(plan.amount)}</strong></button>`).join("") : '<div class="ld-state">No plans match this filter.</div>';
      grid.querySelectorAll(".ld-plan").forEach(button => button.onclick = () => {
        selected = plans.find(plan => plan.code === button.dataset.code) || null;
        summary.textContent = selected ? `${network} • ${selected.name} • ${money(selected.amount)}` : "Select a bundle";
        next.disabled = !selected; error.style.display = "none"; renderPlans();
      });
    }

    let loadSequence = 0;
    async function load() {
      const sequence = ++loadSequence, requestedNetwork = network;
      selected = null; next.disabled = true; summary.textContent = "Select a data bundle to continue";
      error.style.display = "none"; summary.onclick = null; summary.style.cursor = "";
      filter = "All";
      overlay.querySelectorAll(".ld-filter").forEach(button => button.classList.toggle("on", button.dataset.filter === "All"));
      plans = getAccessToken() ? (cachedDataPlans(network, PLAN_DISPLAY_MS) || []) : [];
      if (plans.length) renderPlans();
      else grid.innerHTML = '<div class="ld-skeleton" role="status" aria-label="Loading data plans"><span></span><span></span><span></span><span></span></div>';
      warmDataPlans().then(() => {
        if (sequence !== loadSequence || !overlay.isConnected || plans.length) return;
        const saved = cachedDataPlans(requestedNetwork, PLAN_DISPLAY_MS);
        if (saved) { plans = saved; renderPlans(); }
      });
      try {
        const loaded = await loadDataPlans(requestedNetwork);
        if (sequence !== loadSequence || !overlay.isConnected || !grid.isConnected) return;
        if (selected) {
          selected = loaded.find(plan => plan.code === selected.code && plan.amount === selected.amount) || null;
          next.disabled = !selected;
          if (!selected) summary.textContent = "Plans updated. Select a data bundle to continue.";
        }
        plans = loaded; renderPlans();
        if (loaded.partial) {
          summary.textContent = "Some categories could not refresh. Saved bundles remain shown; prices are checked before payment. Tap to retry.";
          summary.style.cursor = "pointer";
          summary.onclick = () => { summary.onclick = null; load(); };
        }
      } catch (loadError) {
        if (sequence !== loadSequence || !overlay.isConnected || !grid.isConnected) return;
        if(loadError.auth){
          plans=[];selected=null;next.disabled=true;
          grid.innerHTML='<div class="ld-state">Your session expired. Please sign in again to load data bundles.</div>';
          return;
        }
        if (plans.length) {
          summary.textContent = "Saved bundles shown. The price is checked before payment.";
          return;
        }
        grid.innerHTML = `<div class="ld-state"><strong>Plans unavailable</strong><br><br>${escapeText(loadError.message)}<br><button class="ld-secondary ld-retry" type="button">Try again</button></div>`;
        grid.querySelector(".ld-retry").onclick = load;
      }
    }

    overlay.querySelectorAll(".ld-network").forEach(button => button.onclick = () => { network = button.dataset.network; overlay.querySelectorAll(".ld-network").forEach(x=>x.classList.remove("on")); button.classList.add("on"); load(); });
    overlay.querySelectorAll(".ld-filter").forEach(button => button.onclick = () => { filter = button.dataset.filter; overlay.querySelectorAll(".ld-filter").forEach(x=>x.classList.remove("on")); button.classList.add("on"); renderPlans(); });

    next.onclick = () => {
      const phone = overlay.querySelector(".ld-phone").value.replace(/\D/g, "");
      if (!/^0\d{10}$/.test(phone)) return showError("Enter a valid 11-digit Nigerian phone number.");
      if (!selected) return showError("Select a data bundle.");
      const sheet = overlay.querySelector(".ld-sheet");
      const catalogueNodes = Array.from(sheet.childNodes);
      const catalogueScroll = overlay.querySelector(".ld-body").scrollTop;
      const returnToCatalogue = () => { if(overlay.dataset.paymentBusy === "1") return; sheet.querySelector(".ld-pin").value = ""; sheet.replaceChildren(...catalogueNodes); overlay.querySelector(".ld-body").scrollTop = catalogueScroll; };
      sheet.innerHTML = `<div class="ld-head"><div class="ld-handle"></div><div class="ld-top"><button class="ld-close ld-back" type="button" aria-label="Back to data bundles">←</button><div><h2>Review Data Purchase</h2><p>Confirm before payment</p></div><button class="ld-close" type="button">×</button></div></div><div class="ld-review"><div style="text-align:center;margin-bottom:17px;font-size:42px">📶<h2 style="font-size:24px;margin:5px 0">${money(selected.amount)}</h2></div><div class="ld-card"><div class="ld-row"><span>Network</span><b>${escapeText(network)}</b></div><div class="ld-row"><span>Bundle</span><b style="text-align:right">${escapeText(selected.name)}</b></div><div class="ld-row"><span>Phone</span><b>${phone}</b></div></div><input class="ld-input ld-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"><div class="ld-error"></div><button class="ld-primary ld-pay" type="button" style="margin-top:12px">Confirm Payment</button><button class="ld-secondary ld-back" type="button">Back</button></div>`;
      sheet.querySelectorAll(".ld-close:not(.ld-back)").forEach(button => button.onclick = close);
      sheet.querySelectorAll(".ld-back").forEach(button => button.onclick = returnToCatalogue);
      sheet.querySelector(".ld-pay").onclick = async () => {
        const button = sheet.querySelector(".ld-pay"), pin = sheet.querySelector(".ld-pin"), box = sheet.querySelector(".ld-error");
        const fail = message => { box.textContent = message; box.style.display = "block"; };
        if (!/^\d{4}$/.test(pin.value)) return fail("Enter your 4-digit payment PIN.");
        overlay.dataset.paymentBusy = "1";
        sheet.querySelectorAll(".ld-back,.ld-close").forEach(control => control.disabled = true);
        button.disabled = true; button.textContent = "Processing…";
        try {
          const result = await purchaseData({network, phone, variationCode:selected.code, amount:selected.amount, pin:pin.value}); pin.value = "";
          const status = String(result?.content?.transactions?.status || "").toLowerCase();
          if (result.pending || String(result.code) === "099" || status === "pending" || status === "initiated") {
            sheet.innerHTML = `<div class="ld-review" style="text-align:center;padding-top:38px"><h2>Awaiting Confirmation</h2><p style="color:#66768b">Your request was submitted. If the data has arrived, do not buy it again. We are waiting for the provider’s final status.</p><p style="color:#66768b">Reference: ${escapeText(result.request_id || "")}</p><button class="ld-primary ld-check" type="button">Check Status</button><button class="ld-secondary ld-done" type="button">Done</button><p class="ld-check-result" style="color:#66768b"></p></div>`;
            sheet.querySelector(".ld-done").onclick = close;
            sheet.querySelector(".ld-check").onclick = async event => {
              const check = event.currentTarget; check.disabled = true; check.textContent = "Checking…";
              const confirmation = await window.waitForSecurePayment?.(result.request_id);
              if (!sheet.isConnected) return;
              if (confirmation?.status === "successful") {
                sheet.innerHTML = `<div class="ld-review" style="text-align:center;padding-top:38px"><h2>Data Purchase Successful</h2><p>${escapeText(selected.name)} was sent to ${phone}.</p><button class="ld-primary ld-done" type="button">Done</button></div>`;
                sheet.querySelector(".ld-done").onclick = close;
              } else {
                sheet.querySelector(".ld-check-result").textContent = confirmation?.status === "refunded" ? "Purchase failed. Your wallet was refunded." : confirmation?.status === "failed" ? "Purchase failed. Check Transactions for details." : "Still awaiting the provider’s confirmation. You can close this screen and check Transactions later.";
                check.disabled = false; check.textContent = "Check Status";
              }
            };
            return;
          }
          if (String(result.code) !== "000" || status !== "delivered") throw new Error("Data payment was not confirmed as delivered.");
          sheet.innerHTML = `<div class="ld-review" style="text-align:center;padding-top:38px"><div style="width:68px;height:68px;border-radius:50%;background:#e8faf2;color:#07865a;display:grid;place-items:center;margin:auto;font-size:34px">✓</div><h2>Data Purchase Successful</h2><p style="color:#66768b">${escapeText(selected.name)} was sent to ${phone}.</p><button class="ld-primary ld-done" type="button">Done</button></div>`; sheet.querySelector(".ld-done").onclick=close;
        } catch (purchaseError) { const refund = purchaseError.refunded ? " Your wallet was refunded." : purchaseError.refund_error ? ` Refund issue: ${purchaseError.refund_error}` : ""; fail((purchaseError.message || "Data payment failed.") + refund); button.disabled=false; button.textContent="Confirm Payment"; } finally { delete overlay.dataset.paymentBusy; sheet.querySelectorAll(".ld-back,.ld-close").forEach(control => control.disabled = false); }
      };
    };
    load();
  };

  window.LonerPayData =
    Object.freeze({
      serviceIDs: {
        ...serviceIDs
      },

      loadPlans:
        loadDataPlans,

      purchase:
        purchaseData
    });
})(); 



