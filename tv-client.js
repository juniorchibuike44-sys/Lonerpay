(function installSecureTvPayment() {
  const providerNames = {
    dstv: "DStv",
    gotv: "GOtv",
    startimes: "StarTimes"
  };

  function escapeTvText(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  window.buyTV = function buySecureTv() {
    const overlay = document.createElement("div");
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;
      align-items:center;justify-content:center;z-index:9999;padding:20px;overflow:auto;`;
    overlay.innerHTML = `
      <div style="background:white;width:100%;max-width:430px;border-radius:20px;padding:24px;
        box-sizing:border-box;font-family:Arial,sans-serif;color:#111827;margin:auto;">
        <h2 style="margin-top:0;">Pay TV Subscription</h2>

        <label style="display:block;margin:12px 0 6px;">TV provider</label>
        <select id="secureTvProvider" style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;">
          <option value="">Select provider</option>
          <option value="dstv">DStv</option>
          <option value="gotv">GOtv</option>
          <option value="startimes">StarTimes</option>
        </select>

        <label style="display:block;margin:12px 0 6px;">Smartcard / IUC number</label>
        <input id="secureTvCard" inputmode="numeric" placeholder="1212121212"
          style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;box-sizing:border-box;">

        <button id="secureTvVerify" style="width:100%;padding:14px;margin-top:16px;border:0;border-radius:12px;
          background:#2563eb;color:white;font-size:16px;font-weight:bold;">Verify Decoder</button>

        <div id="secureTvCustomer" style="display:none;margin-top:14px;padding:13px;border-radius:10px;background:#ecfdf5;"></div>

        <div id="secureTvPaymentFields" style="display:none;">
          <label style="display:block;margin:12px 0 6px;">Bouquet</label>
          <select id="secureTvPlan" style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;">
            <option value="">Loading bouquets...</option>
          </select>

          <label style="display:block;margin:12px 0 6px;">Phone number</label>
          <input id="secureTvPhone" inputmode="numeric" placeholder="08011111111"
            style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;box-sizing:border-box;">

          <button id="secureTvConfirm" disabled style="width:100%;padding:15px;margin-top:18px;border:0;border-radius:12px;
            background:#111827;color:white;font-size:16px;font-weight:bold;opacity:.55;">Confirm Payment</button>
        </div>

        <button id="secureTvCancel" style="width:100%;padding:13px;margin-top:8px;border:0;background:transparent;">Cancel</button>
      </div>`;

    document.body.appendChild(overlay);
    const provider = overlay.querySelector("#secureTvProvider");
    const card = overlay.querySelector("#secureTvCard");
    const verify = overlay.querySelector("#secureTvVerify");
    const customer = overlay.querySelector("#secureTvCustomer");
    const fields = overlay.querySelector("#secureTvPaymentFields");
    const plan = overlay.querySelector("#secureTvPlan");
    const phone = overlay.querySelector("#secureTvPhone");
    const confirm = overlay.querySelector("#secureTvConfirm");
    const accessToken = localStorage.getItem("lonerpay_access_token");
    let verifiedDetails = null;

    overlay.querySelector("#secureTvCancel").onclick = () => overlay.remove();

    const resetVerification = () => {
      verifiedDetails = null;
      customer.style.display = "none";
      fields.style.display = "none";
      confirm.disabled = true;
      confirm.style.opacity = ".55";
    };
    provider.onchange = resetVerification;
    card.oninput = resetVerification;

    plan.onchange = () => {
      confirm.disabled = !plan.value;
      confirm.style.opacity = plan.value ? "1" : ".55";
    };

    verify.onclick = async () => {
      const billersCode = card.value.trim();
      if (!provider.value) return alert("Select a TV provider.");
      if (!/^\d{8,15}$/.test(billersCode)) return alert("Enter a valid smartcard number.");

      verify.disabled = true;
      verify.textContent = "Verifying...";
      try {
        const [verifyResponse, planResponse] = await Promise.all([
          fetch("/api/verify-tv", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ serviceID: provider.value, billersCode })
          }),
          fetch(`/api/tv-variations?serviceID=${encodeURIComponent(provider.value)}`, {
            headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store"
          })
        ]);

        const verifyData = await verifyResponse.json();
        const planData = await planResponse.json();
        if (!verifyResponse.ok) throw new Error(verifyData.error || "Decoder verification failed");
        if (!planResponse.ok) throw new Error(planData.error || "Could not load bouquets");

        verifiedDetails = {
          ...verifyData,
          serviceID: provider.value,
          billersCode
        };

        customer.innerHTML = `<strong>✅ ${escapeTvText(verifyData.customerName)}</strong><br>
          ${escapeTvText(verifyData.customerType)}${verifyData.status ? ` • ${escapeTvText(verifyData.status)}` : ""}
          ${verifyData.currentBouquet ? `<br>Current bouquet: ${escapeTvText(verifyData.currentBouquet)}` : ""}`;
        customer.style.display = "block";

        plan.innerHTML = '<option value="">Select bouquet</option>';
        planData.variations
          .filter(item => item.code && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0)
          .forEach(item => {
            const option = document.createElement("option");
            option.value = item.code;
            option.dataset.amount = String(item.amount);
            option.textContent = `${item.name} — ₦${Number(item.amount).toFixed(2)}`;
            plan.appendChild(option);
          });

        fields.style.display = "block";
      } catch (error) {
        resetVerification();
        alert(error.message);
      } finally {
        verify.disabled = false;
        verify.textContent = "Verify Decoder";
      }
    };

    confirm.onclick = async () => {
      if (!verifiedDetails || confirm.disabled) return;
      const phoneNumber = phone.value.trim();
      const selectedPlan = plan.selectedOptions[0];
      const paymentAmount = Number(selectedPlan?.dataset.amount);

      if (!/^\d{11,12}$/.test(phoneNumber)) return alert("Enter a valid phone number.");
      if (!plan.value || !Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        return alert("Select a valid bouquet.");
      }

      confirm.disabled = true;
      confirm.textContent = "Processing...";
      confirm.style.opacity = ".65";

      try {
        const response = await fetch("/api/secure-pay", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            serviceID: verifiedDetails.serviceID,
            billersCode: verifiedDetails.billersCode,
            variation_code: plan.value,
            amount: paymentAmount,
            phone: phoneNumber,
            email: "sandbox@sandbox.com",
            subscription_type: "change",
            quantity: 1
          })
        });
        const data = await response.json();

        if (typeof window.refreshSecureWallet === "function") await window.refreshSecureWallet();
        if (typeof window.refreshSecureTransactions === "function") await window.refreshSecureTransactions();

        if (!response.ok) {
          const refundText = data.refunded ? "\n\nYour wallet has been refunded." :
            (data.refund_error ? `\n\nRefund error: ${data.refund_error}` : "");
          throw new Error((data.error || data.message || "Payment failed") + refundText);
        }

        const providerStatus = String(data?.content?.transactions?.status || "").toLowerCase();
        if (String(data.code) === "099" || providerStatus === "pending" || providerStatus === "initiated") {
          alert("Payment is pending. Please check Recent Transactions shortly.");
          overlay.remove();
          return;
        }
        if (String(data.code) !== "000" || (providerStatus && providerStatus !== "delivered")) {
          throw new Error("TV subscription payment failed");
        }

        overlay.innerHTML = `<div style="background:white;width:100%;max-width:430px;border-radius:20px;padding:30px 24px;
          box-sizing:border-box;text-align:center;font-family:Arial,sans-serif;color:#111827;">
          <div style="font-size:55px;">✅</div><h2>TV Subscription Successful</h2>
          <p><strong>₦${paymentAmount.toFixed(2)}</strong></p>
          <p>${escapeTvText(providerNames[verifiedDetails.serviceID])} • ${escapeTvText(verifiedDetails.customerName)}</p>
          <p>${escapeTvText(selectedPlan.textContent)}</p>
          <p>Smartcard: ${escapeTvText(verifiedDetails.billersCode)}</p>
          <button id="secureTvDone" style="width:100%;padding:15px;border:0;border-radius:12px;background:#111827;
            color:white;font-size:16px;font-weight:bold;margin-top:15px;">Done</button></div>`;
        overlay.querySelector("#secureTvDone").onclick = () => overlay.remove();
      } catch (error) {
        alert(error.message);
        confirm.disabled = false;
        confirm.textContent = "Confirm Payment";
        confirm.style.opacity = "1";
      }
    };
  };
})();
