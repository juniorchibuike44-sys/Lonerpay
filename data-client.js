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

  async function loadDataPlans(network) {
    const serviceID = serviceIDs[network];

    if (!serviceID) {
      throw new Error("Select a valid network.");
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      throw new Error("Please log in again.");
    }

    const response = await fetch(
      `/api/variations?serviceID=${encodeURIComponent(serviceID)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        cache: "no-store"
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        data.message ||
        "Could not load data plans."
      );
    }

    return (Array.isArray(data.variations)
      ? data.variations
      : []
    )
      .filter(
        item =>
          item &&
          item.code &&
          Number.isFinite(Number(item.amount))
      )
      .map(item => ({
        code: String(item.code),
        name: String(item.name || "Data plan"),
        amount: Number(item.amount),
        network: network,
        serviceID: serviceID
      }));
  }

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

    const data =
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
    if (/daily|day|24\s*hour/.test(text)) return "Daily";
    if (/weekly|week|7\s*day/.test(text)) return "Weekly";
    if (/monthly|month|30\s*day/.test(text)) return "Monthly";
    return "Other";
  }

  // The dashboard used to show a hard-coded MTN preview that could never
  // complete payment. This live catalogue always uses VTpass variation codes.
  window.buyData = function buyLiveData() {
    document.getElementById("lpLiveData")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "lpLiveData";
    overlay.innerHTML = `
      <style>
        #lpLiveData{position:fixed;inset:0;z-index:28000;background:rgba(3,15,35,.7);display:flex;align-items:flex-end;justify-content:center;font-family:Inter,system-ui,sans-serif}
        #lpLiveData *{box-sizing:border-box}.ld-sheet{width:100%;max-width:560px;max-height:94vh;display:flex;flex-direction:column;background:#f5f8fc;border-radius:28px 28px 0 0;overflow:hidden}
        .ld-head{background:linear-gradient(135deg,#061b39,#0a4ca7);color:#fff;padding:16px 18px 19px}.ld-handle{width:44px;height:5px;border-radius:9px;background:rgba(255,255,255,.35);margin:0 auto 13px}.ld-top{display:flex;align-items:center;justify-content:space-between}.ld-top h2{margin:0;font-size:22px}.ld-top p{margin:3px 0 0;color:#cbdcf5;font-size:12px}.ld-close{width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.13);color:#fff;font-size:23px}
        .ld-body{padding:15px;overflow:auto}.ld-label{display:block;margin:2px 0 8px;color:#66768b;font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.ld-networks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.ld-network,.ld-filter{border:1px solid #dfe7f0;background:#fff;color:#536277;border-radius:13px;padding:10px 4px;font-size:11px;font-weight:850}.ld-network.on,.ld-filter.on{border-color:#0867df;background:#eaf4ff;color:#0860c7}.ld-filters{display:flex;gap:7px;overflow:auto;padding:13px 0 10px;scrollbar-width:none}.ld-filter{flex:0 0 auto;border-radius:999px;padding:8px 13px}.ld-state{padding:28px 15px;text-align:center;background:#fff;border:1px dashed #cfdae8;border-radius:17px;color:#66768b;font-size:13px}.ld-plans{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ld-plan{position:relative;min-height:103px;text-align:left;border:1px solid #dfe7f0;background:#fff;border-radius:17px;padding:13px}.ld-plan.on{border:2px solid #0867df;background:#f3f8ff}.ld-plan b{display:block;color:#13253d;font-size:13px;line-height:1.35}.ld-plan strong{display:block;color:#0867df;font-size:16px;margin-top:11px}.ld-checkout{border-top:1px solid #e3eaf2;background:#fff;padding:13px 15px calc(15px + env(safe-area-inset-bottom))}.ld-input{width:100%;border:1px solid #d7e0eb;border-radius:13px;padding:13px 14px;outline:0}.ld-summary{min-height:17px;margin:7px 2px 10px;color:#6a788c;font-size:11px}.ld-primary{width:100%;border:0;border-radius:14px;padding:14px;background:#0867df;color:#fff;font-weight:900}.ld-primary:disabled{opacity:.45}.ld-error{display:none;margin:10px 0 0;padding:10px 11px;border:1px solid #fecdd3;background:#fff1f2;color:#b42318;border-radius:12px;font-size:12px}.ld-review{padding:18px;overflow:auto}.ld-card{background:#fff;border:1px solid #e1e8f0;border-radius:18px;padding:6px 14px}.ld-row{display:flex;justify-content:space-between;gap:15px;padding:11px 0;border-bottom:1px solid #ebf0f5;font-size:13px}.ld-row:last-child{border:0}.ld-pin{margin-top:15px;text-align:center;letter-spacing:9px;font-size:19px}.ld-secondary{width:100%;border:0;background:transparent;padding:13px;color:#536277;font-weight:800}
        @media(max-width:370px){.ld-plans{grid-template-columns:1fr}.ld-network{font-size:10px}}
      </style>
      <div class="ld-sheet"><div class="ld-head"><div class="ld-handle"></div><div class="ld-top"><div><h2>Buy Data</h2><p>Live bundles from your selected network</p></div><button class="ld-close" type="button">×</button></div></div>
      <div class="ld-body"><span class="ld-label">Select network</span><div class="ld-networks">${Object.keys(serviceIDs).map((name,index)=>`<button class="ld-network ${index===0?"on":""}" data-network="${name}" type="button">${name}</button>`).join("")}</div><div class="ld-filters">${["All","Daily","Weekly","Monthly","Other"].map((name,index)=>`<button class="ld-filter ${index===0?"on":""}" data-filter="${name}" type="button">${name}</button>`).join("")}</div><span class="ld-label">Available bundles</span><div class="ld-plans"><div class="ld-state">Loading current plans…</div></div></div>
      <div class="ld-checkout"><input class="ld-input ld-phone" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="Phone number • 08012345678"><div class="ld-summary">Select a data bundle to continue</div><button class="ld-primary ld-continue" type="button" disabled>Continue</button><div class="ld-error"></div></div></div>`;
    document.body.appendChild(overlay);

    let network = "MTN", filter = "All", plans = [], selected = null;
    const grid = overlay.querySelector(".ld-plans"), summary = overlay.querySelector(".ld-summary"), next = overlay.querySelector(".ld-continue"), error = overlay.querySelector(".ld-error");
    const showError = message => { error.textContent = message; error.style.display = "block"; };
    const close = () => overlay.remove();
    overlay.querySelector(".ld-close").onclick = close;

    function renderPlans() {
      const visible = plans.filter(plan => filter === "All" || planPeriod(plan.name) === filter);
      grid.innerHTML = visible.length ? visible.map(plan => `<button class="ld-plan ${selected?.code===plan.code?"on":""}" data-code="${escapeText(plan.code)}" type="button"><b>${escapeText(plan.name)}</b><strong>${money(plan.amount)}</strong></button>`).join("") : '<div class="ld-state">No plans match this filter.</div>';
      grid.querySelectorAll(".ld-plan").forEach(button => button.onclick = () => {
        selected = plans.find(plan => plan.code === button.dataset.code) || null;
        summary.textContent = selected ? `${network} • ${selected.name} • ${money(selected.amount)}` : "Select a bundle";
        next.disabled = !selected; error.style.display = "none"; renderPlans();
      });
    }

    async function load() {
      selected = null; plans = []; next.disabled = true; summary.textContent = "Select a data bundle to continue";
      grid.innerHTML = '<div class="ld-state">Loading current plans…</div>'; error.style.display = "none";
      try { plans = await loadDataPlans(network); renderPlans(); }
      catch (loadError) { grid.innerHTML = `<div class="ld-state"><strong>Plans unavailable</strong><br><br>${escapeText(loadError.message)}</div>`; }
    }

    overlay.querySelectorAll(".ld-network").forEach(button => button.onclick = () => { network = button.dataset.network; overlay.querySelectorAll(".ld-network").forEach(x=>x.classList.remove("on")); button.classList.add("on"); load(); });
    overlay.querySelectorAll(".ld-filter").forEach(button => button.onclick = () => { filter = button.dataset.filter; overlay.querySelectorAll(".ld-filter").forEach(x=>x.classList.remove("on")); button.classList.add("on"); renderPlans(); });

    next.onclick = () => {
      const phone = overlay.querySelector(".ld-phone").value.replace(/\D/g, "");
      if (!/^0\d{10}$/.test(phone)) return showError("Enter a valid 11-digit Nigerian phone number.");
      if (!selected) return showError("Select a data bundle.");
      const sheet = overlay.querySelector(".ld-sheet");
      sheet.innerHTML = `<div class="ld-head"><div class="ld-handle"></div><div class="ld-top"><div><h2>Review Data Purchase</h2><p>Confirm before payment</p></div><button class="ld-close" type="button">×</button></div></div><div class="ld-review"><div style="text-align:center;margin-bottom:17px;font-size:42px">📶<h2 style="font-size:24px;margin:5px 0">${money(selected.amount)}</h2></div><div class="ld-card"><div class="ld-row"><span>Network</span><b>${escapeText(network)}</b></div><div class="ld-row"><span>Bundle</span><b style="text-align:right">${escapeText(selected.name)}</b></div><div class="ld-row"><span>Phone</span><b>${phone}</b></div></div><input class="ld-input ld-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"><div class="ld-error"></div><button class="ld-primary ld-pay" type="button" style="margin-top:12px">Confirm Payment</button><button class="ld-secondary ld-back" type="button">Back</button></div>`;
      sheet.querySelector(".ld-close").onclick = close;
      sheet.querySelector(".ld-back").onclick = () => { close(); window.buyData(); };
      sheet.querySelector(".ld-pay").onclick = async () => {
        const button = sheet.querySelector(".ld-pay"), pin = sheet.querySelector(".ld-pin"), box = sheet.querySelector(".ld-error");
        const fail = message => { box.textContent = message; box.style.display = "block"; };
        if (!/^\d{4}$/.test(pin.value)) return fail("Enter your 4-digit payment PIN.");
        button.disabled = true; button.textContent = "Processing…";
        try {
          const result = await purchaseData({network, phone, variationCode:selected.code, amount:selected.amount, pin:pin.value}); pin.value = "";
          const status = String(result?.content?.transactions?.status || "").toLowerCase();
          if (result.pending || String(result.code) === "099" || status === "pending" || status === "initiated") { fail("Payment is pending confirmation. Do not pay again; check Transactions shortly."); button.disabled=false; button.textContent="Confirm Payment"; return; }
          if (String(result.code) !== "000" || status !== "delivered") throw new Error("Data payment was not confirmed as delivered.");
          sheet.innerHTML = `<div class="ld-review" style="text-align:center;padding-top:38px"><div style="width:68px;height:68px;border-radius:50%;background:#e8faf2;color:#07865a;display:grid;place-items:center;margin:auto;font-size:34px">✓</div><h2>Data Purchase Successful</h2><p style="color:#66768b">${escapeText(selected.name)} was sent to ${phone}.</p><button class="ld-primary ld-done" type="button">Done</button></div>`; sheet.querySelector(".ld-done").onclick=close;
        } catch (purchaseError) { const refund = purchaseError.refunded ? " Your wallet was refunded." : purchaseError.refund_error ? ` Refund issue: ${purchaseError.refund_error}` : ""; fail((purchaseError.message || "Data payment failed.") + refund); button.disabled=false; button.textContent="Confirm Payment"; }
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
