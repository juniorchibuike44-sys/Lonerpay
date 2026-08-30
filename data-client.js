(function installSecureDataPayment() {
  const serviceIDs = {
    MTN: "mtn-data",
    Airtel: "airtel-data",
    Glo: "glo-data",
    "9mobile": "etisalat-data"
  };

  function escapeDataText(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  window.buyData = function buySecureData() {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;
      align-items:center;justify-content:center;z-index:9999;padding:20px;
    `;
    overlay.innerHTML = `
      <div style="background:white;width:100%;max-width:420px;border-radius:20px;
        padding:24px;box-sizing:border-box;font-family:Arial,sans-serif;color:#111827;">
        <h2 style="margin-top:0;">Buy Data</h2>

        <label style="display:block;margin:14px 0 6px;">Network</label>
        <select id="secureDataNetwork" style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;">
          <option value="">Select network</option>
          <option>MTN</option><option>Airtel</option><option>Glo</option><option>9mobile</option>
        </select>

        <label style="display:block;margin:14px 0 6px;">Phone number</label>
        <input id="secureDataPhone" inputmode="numeric" placeholder="08011111111"
          style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;box-sizing:border-box;">

        <label style="display:block;margin:14px 0 6px;">Data plan</label>
        <select id="secureDataPlan" disabled
          style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;">
          <option value="">Select a network first</option>
        </select>

        <label style="display:block;margin:14px 0 6px;">Payment PIN</label>
        <input id="secureDataPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off"
          placeholder="••••" style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;
          box-sizing:border-box;text-align:center;font-size:18px;letter-spacing:8px;">

        <button id="secureDataConfirm" disabled style="width:100%;padding:15px;margin-top:18px;
          border:0;border-radius:12px;background:#111827;color:white;font-size:16px;font-weight:bold;opacity:.55;">
          Confirm Payment
        </button>
        <button id="secureDataCancel" style="width:100%;padding:13px;margin-top:8px;border:0;background:transparent;">
          Cancel
        </button>
      </div>`;

    document.body.appendChild(overlay);

    const network = overlay.querySelector("#secureDataNetwork");
    const phone = overlay.querySelector("#secureDataPhone");
    const plan = overlay.querySelector("#secureDataPlan");
    const confirm = overlay.querySelector("#secureDataConfirm");
    const pin = overlay.querySelector("#secureDataPin");
    const accessToken = localStorage.getItem("lonerpay_access_token");

    overlay.querySelector("#secureDataCancel").onclick = () => overlay.remove();

    network.onchange = async () => {
      plan.disabled = true;
      confirm.disabled = true;
      confirm.style.opacity = ".55";
      plan.innerHTML = '<option value="">Loading plans...</option>';

      const serviceID = serviceIDs[network.value];

      if (!serviceID) {
        plan.innerHTML = '<option value="">Select a network first</option>';
        return;
      }

      try {
        const response = await fetch(
          `/api/variations?serviceID=${encodeURIComponent(serviceID)}`,
          { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
        );
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || "Could not load plans");

        plan.innerHTML = '<option value="">Select data plan</option>';
        data.variations
          .filter(item => item.code && Number.isFinite(Number(item.amount)))
          .forEach(item => {
            const option = document.createElement("option");
            option.value = item.code;
            option.dataset.amount = String(item.amount);
            option.textContent = `${item.name} — ₦${Number(item.amount).toFixed(2)}`;
            plan.appendChild(option);
          });
        plan.disabled = false;
      } catch (error) {
        plan.innerHTML = '<option value="">Could not load plans</option>';
        alert(error.message);
      }
    };

    plan.onchange = () => {
      confirm.disabled = !plan.value;
      confirm.style.opacity = plan.value ? "1" : ".55";
    };

    confirm.onclick = async () => {
      if (confirm.disabled) return;

      const phoneNumber = phone.value.trim();
      const selectedPlan = plan.selectedOptions[0];
      const amount = Number(selectedPlan?.dataset.amount);
      const serviceID = serviceIDs[network.value];

      if (!/^\d{4}$/.test(pin.value)) {
        alert("Enter your 4-digit payment PIN.");
        return;
      }

      if (!/^\d{11,12}$/.test(phoneNumber)) {
        alert("Enter a valid phone number.");
        return;
      }

      if (!serviceID || !plan.value || !Number.isFinite(amount) || amount <= 0) {
        alert("Select a valid data plan.");
        return;
      }

      confirm.disabled = true;
      confirm.textContent = "Processing...";
      confirm.style.opacity = ".65";

      try {
        const response = await fetch("/api/secure-pay", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            serviceID,
            billersCode: phoneNumber,
            variation_code: plan.value,
            amount,
            phone: phoneNumber,
            email: "sandbox@sandbox.com",
            pin: pin.value
          })
        });
        const data = await response.json();

        if (typeof window.refreshSecureWallet === "function") {
          await window.refreshSecureWallet();
        }
        if (typeof window.refreshSecureTransactions === "function") {
          await window.refreshSecureTransactions();
        }

        if (!response.ok) {
          const refundText = data.refunded
            ? "\n\nYour wallet has been refunded."
            : (data.refund_error ? `\n\nRefund error: ${data.refund_error}` : "");
          throw new Error((data.error || data.message || "Payment failed") + refundText);
        }

        const providerStatus = data?.content?.transactions?.status;
        if (data.code === "099" || providerStatus === "pending" || providerStatus === "initiated") {
          alert("Payment is pending. Please check Recent Transactions shortly.");
          overlay.remove();
          return;
        }

        if (data.code !== "000" || providerStatus !== "delivered") {
          throw new Error("Data payment failed");
        }

        overlay.innerHTML = `
          <div style="background:white;width:100%;max-width:420px;border-radius:20px;
            padding:30px 24px;box-sizing:border-box;text-align:center;font-family:Arial,sans-serif;color:#111827;">
            <div style="font-size:55px;">✅</div>
            <h2>Data Payment Successful</h2>
            <p><strong>₦${amount.toFixed(2)}</strong></p>
            <p>${escapeDataText(network.value)} • ${escapeDataText(phoneNumber)}</p>
            <p>${escapeDataText(selectedPlan.textContent)}</p>
            <button id="secureDataDone" style="width:100%;padding:15px;border:0;border-radius:12px;
              background:#111827;color:white;font-size:16px;font-weight:bold;margin-top:15px;">Done</button>
          </div>`;
        overlay.querySelector("#secureDataDone").onclick = () => overlay.remove();
      } catch (error) {
        alert(error.message);
        confirm.disabled = false;
        confirm.textContent = "Confirm Payment";
        confirm.style.opacity = "1";
      }
    };
  };
})();
