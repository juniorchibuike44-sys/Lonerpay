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

          email:
            "sandbox@sandbox.com",

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

  /*
   * IMPORTANT
   *
   * dashboard.html now controls the
   * professional Data interface.
   *
   * DO NOT put:
   *
   * window.buyData = ...
   *
   * inside this file again.
   */

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
