(function installSecureElectricityPayment() {
  const providers = [
    ["Ikeja Electric (IKEDC)", "ikeja-electric"],
    ["Eko Electric (EKEDC)", "eko-electric"],
    ["Abuja Electric (AEDC)", "abuja-electric"],
    ["Ibadan Electric (IBEDC)", "ibadan-electric"],
    ["Enugu Electric (EEDC)", "enugu-electric"],
    ["Benin Electric (BEDC)", "benin-electric"],
    ["Kaduna Electric (KAEDCO)", "kaduna-electric"],
    ["Kano Electric (KEDCO)", "kano-electric"],
    ["Jos Electric (JED)", "jos-electric"],
    ["Yola Electric (YEDC)", "yola-electric"],
    ["Aba Electric", "aba-electric"]
  ];

  function escapeElectricityText(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function findToken(data) {
    const candidates = [
      data?.token,
      data?.Token,
      data?.content?.token,
      data?.content?.Token,
      data?.content?.transactions?.token,
      data?.content?.transactions?.Token,
      data?.purchased_code
    ];
    return candidates.find(value => typeof value === "string" && value.trim()) || "";
  }

  window.buyElectricity = function buySecureElectricity() {
    const overlay = document.createElement("div");
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;
      align-items:center;justify-content:center;z-index:9999;padding:20px;overflow:auto;`;
    overlay.innerHTML = `
      <div style="background:white;width:100%;max-width:430px;border-radius:20px;padding:24px;
        box-sizing:border-box;font-family:Arial,sans-serif;color:#111827;margin:auto;">
        <h2 style="margin-top:0;">Pay Electricity</h2>
        <label style="display:block;margin:12px 0 6px;">Distribution company</label>
        <select id="electricProvider" style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;">
          <option value="">Select provider</option>
          ${providers.map(([name, id]) => `<option value="${id}">${name}</option>`).join("")}
        </select>
        <label style="display:block;margin:12px 0 6px;">Meter type</label>
        <select id="electricType" style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;">
          <option value="prepaid">Prepaid</option><option value="postpaid">Postpaid</option>
        </select>
        <label style="display:block;margin:12px 0 6px;">Meter number</label>
        <input id="electricMeter" inputmode="numeric" placeholder="1111111111111"
          style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;box-sizing:border-box;">
        <button id="electricVerify" style="width:100%;padding:14px;margin-top:16px;border:0;border-radius:12px;
          background:#2563eb;color:white;font-size:16px;font-weight:bold;">Verify Meter</button>
        <div id="electricCustomer" style="display:none;margin-top:14px;padding:13px;border-radius:10px;background:#ecfdf5;"></div>
        <div id="electricPaymentFields" style="display:none;">
          <label style="display:block;margin:12px 0 6px;">Phone number</label>
          <input id="electricPhone" inputmode="numeric" placeholder="08011111111"
            style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;box-sizing:border-box;">
          <label style="display:block;margin:12px 0 6px;">Amount (₦)</label>
          <input id="electricAmount" inputmode="decimal" type="number" min="1" placeholder="100"
            style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;box-sizing:border-box;">
          <label style="display:block;margin:12px 0 6px;">Payment PIN</label>
          <input id="electricPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"
            style="width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;box-sizing:border-box;
            text-align:center;font-size:18px;letter-spacing:8px;">
          <button id="electricConfirm" style="width:100%;padding:15px;margin-top:18px;border:0;border-radius:12px;
            background:#111827;color:white;font-size:16px;font-weight:bold;">Confirm Payment</button>
        </div>
        <button id="electricCancel" style="width:100%;padding:13px;margin-top:8px;border:0;background:transparent;">Cancel</button>
      </div>`;

    document.body.appendChild(overlay);
    const provider = overlay.querySelector("#electricProvider");
    const type = overlay.querySelector("#electricType");
    const meter = overlay.querySelector("#electricMeter");
    const verify = overlay.querySelector("#electricVerify");
    const customer = overlay.querySelector("#electricCustomer");
    const fields = overlay.querySelector("#electricPaymentFields");
    const phone = overlay.querySelector("#electricPhone");
    const amount = overlay.querySelector("#electricAmount");
    const pin = overlay.querySelector("#electricPin");
    const confirm = overlay.querySelector("#electricConfirm");
    const accessToken = localStorage.getItem("lonerpay_access_token");
    let verifiedDetails = null;

    overlay.querySelector("#electricCancel").onclick = () => overlay.remove();
    const resetVerification = () => {
      verifiedDetails = null;
      customer.style.display = "none";
      fields.style.display = "none";
    };
    provider.onchange = resetVerification;
    type.onchange = resetVerification;
    meter.oninput = resetVerification;

    verify.onclick = async () => {
      const meterNumber = meter.value.trim();
      if (!provider.value) return alert("Select an electricity provider.");
      if (!/^\d{6,15}$/.test(meterNumber)) return alert("Enter a valid meter number.");

      verify.disabled = true;
      verify.textContent = "Verifying...";
      try {
        const response = await fetch("/api/verify-meter", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ serviceID: provider.value, billersCode: meterNumber, type: type.value })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.message || "Meter verification failed");

        verifiedDetails = { ...data, serviceID: provider.value, billersCode: meterNumber, type: type.value };
        customer.innerHTML = `<strong>✅ ${escapeElectricityText(data.customerName)}</strong><br>
          ${escapeElectricityText(data.address)}${data.minimumAmount ? `<br>Minimum: ₦${Number(data.minimumAmount).toFixed(2)}` : ""}`;
        customer.style.display = "block";
        fields.style.display = "block";
        amount.min = String(data.minimumAmount || 1);
      } catch (error) {
        resetVerification();
        alert(error.message);
      } finally {
        verify.disabled = false;
        verify.textContent = "Verify Meter";
      }
    };

    confirm.onclick = async () => {
      if (!verifiedDetails || confirm.disabled) return;
      const phoneNumber = phone.value.trim();
      const paymentAmount = Number(amount.value);
      if (!/^\d{11,12}$/.test(phoneNumber)) return alert("Enter a valid phone number.");
      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return alert("Enter a valid amount.");
      if (!/^\d{4}$/.test(pin.value)) return alert("Enter your 4-digit payment PIN.");
      if (verifiedDetails.minimumAmount && paymentAmount < verifiedDetails.minimumAmount) {
        return alert(`Minimum payment is ₦${Number(verifiedDetails.minimumAmount).toFixed(2)}.`);
      }

      confirm.disabled = true;
      confirm.textContent = "Processing...";
      try {
        const response = await fetch("/api/secure-pay", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            serviceID: verifiedDetails.serviceID,
            billersCode: verifiedDetails.billersCode,
            variation_code: verifiedDetails.type,
            amount: paymentAmount,
            phone: phoneNumber,
            email: "sandbox@sandbox.com",
            pin: pin.value
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
        if (data.code === "099" || providerStatus === "pending" || providerStatus === "initiated") {
          alert("Payment is pending. Please check Recent Transactions shortly.");
          overlay.remove();
          return;
        }
        if (String(data.code) !== "000" || (providerStatus && providerStatus !== "delivered")) {
          throw new Error("Electricity payment failed");
        }

        const token = findToken(data);
        overlay.innerHTML = `<div style="background:white;width:100%;max-width:430px;border-radius:20px;padding:30px 24px;
          box-sizing:border-box;text-align:center;font-family:Arial,sans-serif;color:#111827;">
          <div style="font-size:55px;">✅</div><h2>Electricity Payment Successful</h2>
          <p><strong>₦${paymentAmount.toFixed(2)}</strong></p>
          <p>${escapeElectricityText(verifiedDetails.customerName)}</p>
          <p>Meter: ${escapeElectricityText(verifiedDetails.billersCode)}</p>
          ${token ? `<div style="padding:15px;background:#f3f4f6;border-radius:10px;margin:16px 0;">
            <small>Meter token</small><br><strong style="font-size:20px;word-break:break-all;">${escapeElectricityText(token)}</strong></div>` : ""}
          <button id="electricDone" style="width:100%;padding:15px;border:0;border-radius:12px;background:#111827;
            color:white;font-size:16px;font-weight:bold;">Done</button></div>`;
        overlay.querySelector("#electricDone").onclick = () => overlay.remove();
      } catch (error) {
        alert(error.message);
        confirm.disabled = false;
        confirm.textContent = "Confirm Payment";
      }
    };
  };
})();
