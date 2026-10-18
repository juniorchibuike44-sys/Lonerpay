import {pairgateAccounting,savePairgateCost} from "./_provider-accounting.js";
import { sharedCatalogueRequest, cataloguePlanTypes } from "./_catalogue.js";
import { pbkdf2Sync, timingSafeEqual, randomUUID } from "node:crypto";
import { enforceRateLimit, hardenResponse } from "./_security.js";
import {
  isPairgateAccepted,
  isPairgateFailedStatus,
  isPairgateSuccessfulStatus,
  pairgateMessage,
  pairgateReference,
  pairgateRequest,
  pairgateEpinDenominations,
  pairgateStatus
} from "./_pairgate.js";

function verifyStoredPin(pin, storedHash) {
  try {
    const [algorithm, iterationsText, salt, expectedHex] =
      String(storedHash).split("$");

    if (
      algorithm !== "pbkdf2_sha256" ||
      !salt ||
      !expectedHex
    ) {
      return false;
    }

    const iterations = Number(iterationsText);

    if (
      !Number.isSafeInteger(iterations) ||
      iterations < 100000
    ) {
      return false;
    }

    const actual = pbkdf2Sync(
      pin,
      salt,
      iterations,
      32,
      "sha256"
    );

    const expected = Buffer.from(
      expectedHex,
      "hex"
    );

    return (
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}


function createRequestId() {
  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23"
    }
  ).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [
      part.type,
      part.value
    ])
  );

  return (
    values.year +
    values.month +
    values.day +
    values.hour +
    values.minute +
    randomUUID().replaceAll("-", "").slice(0, 24)
  );
}


/* =========================
   LONERPAY SERVICES
========================= */

const airtimeServices = new Set([
  "mtn",
  "airtel",
  "glo",
  "etisalat",
  "9mobile"
]);


const dataServices = new Set([
  "mtn-data",
  "airtel-data",
  "glo-data",
  "etisalat-data"
]);


const electricityServices = new Set([
  "ikedc", "eko", "enugu", "yola", "benin", "ph",
  "aba", "aedc", "kaduna", "kedco", "ibedc", "jedc"
]);


const tvServices = new Set([
  "dstv",
  "gotv",
  "startimes"
]);


/* =========================
   EDUCATION
========================= */

const educationServices = new Set([
  "waec",
  "neco",
  "nabt"
]);

const educationRetailPrices = {
  waec: Number(process.env.LONERPAY_WAEC_PRICE || 5500),
  neco: Number(process.env.LONERPAY_NECO_PRICE || 2500),
  nabt: Number(process.env.LONERPAY_NABTEB_PRICE || 1500)
};

const epinServices = new Set([
  "epin-mtn",
  "epin-airtel",
  "epin-glo",
  "epin-9mobile"
]);


const allowedPaymentServices = new Set([
  ...airtimeServices,
  ...dataServices,
  ...electricityServices,
  ...tvServices,
  ...educationServices,
  ...epinServices
]);


/* =========================
   HANDLER
========================= */

export default async function handler(
  req,
  res
) {
  hardenResponse(res);
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }
  if (!enforceRateLimit(req, res, { key: "secure-pay", limit: 20, windowMs: 60_000 })) return;

  res.setHeader(
    "Cache-Control",
    "no-store"
  );


  const supabaseUrl =
    process.env.SUPABASE_URL;

  const secretKey =
    process.env.SUPABASE_SECRET_KEY;

  const vtpassApiKey =
    process.env.VTPASS_API_KEY;

  const vtpassSecretKey =
    process.env.VTPASS_SECRET_KEY;

  const vtpassPublicKey =
    process.env.VTPASS_PUBLIC_KEY || vtpassSecretKey;

  const vtpassBaseUrl = String(
    process.env.VTPASS_BASE_URL ||
    (String(process.env.VTPASS_ENV || "").toLowerCase() === "live"
      ? "https://vtpass.com/api"
      : "https://sandbox.vtpass.com/api")
  ).replace(/\/+$/, "");

  const vtpassIsLive =
    String(process.env.VTPASS_ENV || "").toLowerCase() === "live" ||
    /^https:\/\/vtpass\.com\/api\/?$/i.test(vtpassBaseUrl);

  const authorization =
    req.headers.authorization;

  const usesPairgate = airtimeServices.has(String(req.body?.serviceID || "")) ||
    dataServices.has(String(req.body?.serviceID || "")) ||
    electricityServices.has(String(req.body?.serviceID || "")) ||
    tvServices.has(String(req.body?.serviceID || "")) ||
    educationServices.has(String(req.body?.serviceID || "")) ||
    epinServices.has(String(req.body?.serviceID || ""));


  if (
    !supabaseUrl ||
    !secretKey ||
    (!usesPairgate && (!vtpassApiKey || !vtpassSecretKey)) ||
    (usesPairgate && !process.env.PAIRGATE_API_KEY)
  ) {
    return res.status(500).json({
      error:
        "Server payment configuration is missing"
    });
  }


  if (
    !authorization?.startsWith(
      "Bearer "
    )
  ) {
    return res.status(401).json({
      error: "Login required"
    });
  }


  const {
    serviceID,
    billersCode,
    variation_code,
    amount,
    phone,
    email,
    subscription_type,
    quantity,
    pin,
    recipient_name
  } = req.body || {};


  const paymentAmount =
    Number(amount);

  const providerServiceID =
    serviceID === "9mobile" ? "etisalat" : serviceID;


  if (
    !serviceID ||
    !billersCode ||
    !Number.isFinite(paymentAmount) ||
    paymentAmount <= 0
  ) {
    return res.status(400).json({
      error:
        "Invalid payment details"
    });
  }


  if (
    !allowedPaymentServices.has(
      serviceID
    )
  ) {
    return res.status(400).json({
      error: "Invalid service"
    });
  }

  // Prevent confusing debits/refunds while testing. VTpass sandbox deliberately
  // fails ordinary customer details and only accepts its documented simulators.
  if (!usesPairgate && !vtpassIsLive) {
    if (dataServices.has(serviceID) && billersCode !== "08011111111") {
      return res.status(400).json({
        error: "VTpass test mode is active. Use 08011111111 for a successful airtime or data test. Your wallet was not debited.",
        sandbox: true,
        refunded: false
      });
    }
    if (electricityServices.has(serviceID)) {
      const expectedMeter = variation_code === "postpaid" ? "1010101010101" : "1111111111111";
      if (billersCode !== expectedMeter) {
        return res.status(400).json({
          error: `VTpass test mode is active. Use ${expectedMeter} for a successful ${variation_code || "prepaid"} meter test. Your wallet was not debited.`,
          sandbox: true,
          refunded: false
        });
      }
    }
    if (tvServices.has(serviceID) && billersCode !== "1212121212") {
      return res.status(400).json({
        error: "VTpass test mode is active. Use 1212121212 for a successful TV decoder test. Your wallet was not debited.",
        sandbox: true,
        refunded: false
      });
    }
  }


  /* =========================
     SERVICE VALIDATION
  ========================= */

  if (
    electricityServices.has(
      serviceID
    ) &&
    variation_code !== "prepaid" &&
    variation_code !== "postpaid"
  ) {
    return res.status(400).json({
      error: "Invalid meter type"
    });
  }

  if (electricityServices.has(serviceID)) {
    if (!/^\d{6,20}$/.test(String(billersCode))) {
      return res.status(400).json({ error: "Enter a valid meter number" });
    }
    if (paymentAmount < 1000) {
      return res.status(400).json({ error: "Minimum electricity payment is ₦1,000" });
    }
  }


  if (
    tvServices.has(serviceID) &&
    !variation_code
  ) {
    return res.status(400).json({
      error: "Select a TV bouquet"
    });
  }


  if (
    educationServices.has(
      serviceID
    ) &&
    !variation_code
  ) {
    return res.status(400).json({
      error:
        "Select an education option"
    });
  }

  if (educationServices.has(serviceID)) {
    const expectedAmount = educationRetailPrices[serviceID];
    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0 || Math.abs(expectedAmount - paymentAmount) > 0.01) {
      return res.status(409).json({
        error: "The education PIN price has changed. Refresh the options before payment."
      });
    }
    if (!Number.isInteger(Number(quantity || 1)) || Number(quantity || 1) !== 1) {
      return res.status(400).json({ error: "Only one education PIN can be purchased at a time" });
    }
  }

  if (epinServices.has(serviceID)) {
    const denomination = Number(variation_code);
    const orderQuantity = Number(quantity);
    if (!Number.isInteger(denomination) || denomination <= 0) {
      return res.status(400).json({ error: "Select a valid recharge-card denomination" });
    }
    if (!Number.isInteger(orderQuantity) || orderQuantity < 1 || orderQuantity > 20) {
      return res.status(400).json({ error: "Quantity must be between 1 and 20 cards" });
    }
    if (Math.abs(paymentAmount - denomination * orderQuantity) > 0.01) {
      return res.status(409).json({ error: "The recharge-card total is incorrect. Refresh and try again." });
    }
  }

  if (airtimeServices.has(serviceID)) {
    if (!/^0\d{10}$/.test(String(billersCode))) {
      return res.status(400).json({ error: "Enter a valid 11-digit Nigerian phone number" });
    }
    if (paymentAmount < 50) {
      return res.status(400).json({ error: "Minimum airtime purchase is ₦50" });
    }
  }


  let user;

  let requestId;

  let debitCompleted = false;

  let providerRequestStarted = false;

  let providerResponseReceived = false;

  let pairgateDataProviderId = "";
  let acceptedPairgateData = null;


  /* =========================
     SUPABASE RPC
  ========================= */

  async function callRpc(
    functionName,
    body
  ) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/${functionName}`,
      {
        method: "POST",

        headers: {
          apikey: secretKey,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify(body)
      }
    );


    const text =
      await response.text();

    let data;


    try {
      data = text
        ? JSON.parse(text)
        : null;
    } catch {
      data = {
        error: text
      };
    }


    if (!response.ok) {
      throw new Error(
        data?.message ||
        data?.error ||
        `${functionName} failed`
      );
    }


    return Array.isArray(data)
      ? data[0]
      : data;
  }

  let recordedPairgateFacts=null,recordedPairgateReference='';
  async function updateTransaction(status, providerData = {}, providerName = "vtpass") {
    if (!user?.id || !requestId) return;
    try {
      if(providerName==='pairgate'){recordedPairgateFacts=pairgateAccounting(providerData,paymentAmount)||recordedPairgateFacts;recordedPairgateReference=String(providerData?.data?.reference_code||providerData?.reference_code||recordedPairgateReference);}
      const facts=providerName==='pairgate'?recordedPairgateFacts:null;
      const providerCost=facts?.provider_cost??null;
      const grossProfit=facts?.gross_profit??null;

      await fetch(
        `${supabaseUrl}/rest/v1/wallet_transactions?user_id=eq.${encodeURIComponent(user.id)}&request_id=eq.${encodeURIComponent(requestId)}&status=${status==='pending'?'eq.pending':status==='successful'?'in.(pending,successful)':'in.(pending,refunded)'}`,
        {
          method: "PATCH",
          headers: {
            apikey: secretKey,
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            status,
            details: {
              provider: providerName,
              serviceID,
              billersCode,
              variation_code: variation_code || "",
              phone: phone || "",
              provider_code: String(providerData?.code || ""),
              provider_status: String(providerData?.content?.transactions?.status || providerData?.data?.status || ""),
              provider_reference: String(providerData?.requestId || providerData?.request_id || providerData?.data?.reference_code || providerData?.reference_code || recordedPairgateReference || ""),
              ...(facts||{}),
              provider_cost: providerCost,
              gross_profit: grossProfit,
              sale_amount: Number(paymentAmount),
              purchased_code: String(providerData?.purchased_code || providerData?.token || ""),
              batch_id: String(providerData?.data?.batch_id || "")
            },
            updated_at: new Date().toISOString()
          })
        }
      );
      if(providerName==='pairgate'&&facts){
        try{await savePairgateCost({base:supabaseUrl,key:secretKey,requestId,providerReference:String(providerData?.data?.reference_code||providerData?.reference_code||acceptedPairgateData?.data?.reference_code||''),facts});}catch{console.error('Provider cost reconciliation is required',{request_id:requestId});}
      }
    } catch (error) {
      console.error("TRANSACTION STATUS UPDATE ERROR:", error);
    }
  }

  async function validateFixedVariation() {
    if (!(dataServices.has(serviceID) || tvServices.has(serviceID))) return;
    if (dataServices.has(serviceID)) {
      const network = serviceID === "etisalat-data" ? "9mobile" : serviceID.replace(/-data$/, "");
      pairgateDataProviderId = network;
      const planTypes = await cataloguePlanTypes(network);
      let selected = null;
      let catalogueError = null;
      for (const planType of planTypes) {
        try {
          const result = await sharedCatalogueRequest(
            `/data-plans?provider_id=${encodeURIComponent(pairgateDataProviderId)}&plan_type=${encodeURIComponent(planType)}`
          );
          if (!result.response.ok || result.data?.status !== "success") {
            catalogueError = Object.assign(new Error("The data provider could not verify this plan. Please try again shortly."), { statusCode: 503 });
            console.warn("Payment catalogue validation failed", { serviceID, planType, status: result.response.status });
            continue;
          }
          const payload = result.data?.data;
          const plans = Array.isArray(payload)
            ? payload
            : Object.values(payload || {}).flatMap(value => Array.isArray(value) ? value : []);
          selected = plans.find(item => String(item?.plan_id || item?.id || "") === String(variation_code || ""));
          if (selected) break;
        } catch (error) {
          catalogueError = error;
        }
      }
      if (!selected && catalogueError) throw catalogueError;
      const expectedAmount = Number(selected?.price || selected?.amount);
      if (!selected || !Number.isFinite(expectedAmount) || expectedAmount <= 0) {
        const error = new Error("The selected data plan is no longer available. Refresh the plans and try again.");
        error.statusCode = 409; throw error;
      }
      if (Math.abs(expectedAmount - paymentAmount) > 0.01) {
        const error = new Error("The data plan price has changed. Refresh the plans before payment.");
        error.statusCode = 409; throw error;
      }
      return;
    }
    const result = await pairgateRequest(
      `/cable-plans?provider_id=${encodeURIComponent(serviceID)}`,
      { method: "GET" }
    );
    const payload = result.data?.data;
    const variations = Array.isArray(payload)
      ? payload
      : Object.values(payload || {}).flatMap(value => Array.isArray(value) ? value : []);
    const selected = variations.find(item =>
      String(item?.plan_id || item?.id || "") === String(variation_code || "")
    );
    const expectedAmount = Number(selected?.price || selected?.amount);
    if (!result.response.ok || result.data?.status !== "success" || !selected || !Number.isFinite(expectedAmount) || expectedAmount <= 0) {
      const error = new Error("The selected plan is no longer available. Refresh the plans and try again.");
      error.statusCode = 409;
      throw error;
    }
    if (Math.abs(expectedAmount - paymentAmount) > 0.01) {
      const error = new Error("The plan price has changed. Refresh the plans before payment.");
      error.statusCode = 409;
      throw error;
    }
  }


  /* =========================
     WALLET REFUND
  ========================= */

  async function refundWallet(
    reason
  ) {
    if (
      !debitCompleted ||
      !user ||
      !requestId
    ) {
      return {
        success: false,

        message:
          "No completed debit to refund"
      };
    }


    try {
      const refund =
        await callRpc(
          "refund_wallet",
          {
            p_user_id:
              user.id,

            p_request_id:
              requestId,

            p_reason:
              reason
          }
        );


      if (
        refund?.success === false
      ) {
        throw new Error(
          refund.message ||
          "Wallet refund was rejected"
        );
      }


      debitCompleted = false;


      return {
        success: true,

        balance:
          Number(
            refund?.new_balance
          ),

        transaction_id:
          refund?.transaction_id ||
          null
      };

    } catch (
      refundError
    ) {
      console.error(
        "WALLET REFUND ERROR:",
        refundError
      );


      return {
        success: false,

        message:
          refundError.message
      };
    }
  }


  try {

    /* =========================
       VERIFY LOGIN
    ========================= */

    const userResponse =
      await fetch(
        `${supabaseUrl}/auth/v1/user`,
        {
          headers: {
            apikey:
              secretKey,

            Authorization:
              authorization
          }
        }
      );


    if (!userResponse.ok) {
      return res
        .status(401)
        .json({
          error:
            "Invalid or expired login"
        });
    }


    user =
      await userResponse.json();


    /* =========================
       PAYMENT PIN
    ========================= */

    if (
      !/^\d{4}$/.test(
        String(pin || "")
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            "Enter your 4-digit payment PIN"
        });
    }


    const pinTableUrl =
      `${supabaseUrl}/rest/v1/payment_pins`;


    const pinHeaders = {
      apikey:
        secretKey,

      Authorization:
        `Bearer ${secretKey}`,

      "Content-Type":
        "application/json"
    };


    const pinResponse =
      await fetch(
        `${pinTableUrl}?user_id=eq.${encodeURIComponent(
          user.id
        )}&select=pin_hash,failed_attempts,locked_until`,
        {
          headers:
            pinHeaders,

          cache:
            "no-store"
        }
      );


    if (!pinResponse.ok) {
      return res
        .status(500)
        .json({
          error:
            "Could not verify payment PIN"
        });
    }


    const pinRecords =
      await pinResponse.json();

    const pinRecord =
      pinRecords[0];


    if (!pinRecord) {
      return res
        .status(403)
        .json({
          error:
            "Create a payment PIN in My Profile first"
        });
    }


    const lockedUntil =
      pinRecord.locked_until
        ? new Date(
            pinRecord.locked_until
          )
        : null;


    if (
      lockedUntil &&
      lockedUntil >
        new Date()
    ) {
      return res
        .status(423)
        .json({
          error:
            "PIN is temporarily locked. Try again later."
        });
    }


    /* =========================
       VERIFY PIN
    ========================= */

    if (
      !verifyStoredPin(
        String(pin),
        pinRecord.pin_hash
      )
    ) {

      const failedAttempts =
        Number(
          pinRecord.failed_attempts ||
          0
        ) + 1;


      const shouldLock =
        failedAttempts >= 5;


      await fetch(
        `${pinTableUrl}?user_id=eq.${encodeURIComponent(
          user.id
        )}`,
        {
          method:
            "PATCH",

          headers:
            pinHeaders,

          body:
            JSON.stringify({
              failed_attempts:
                shouldLock
                  ? 0
                  : failedAttempts,

              locked_until:
                shouldLock
                  ? new Date(
                      Date.now() +
                      15 *
                      60 *
                      1000
                    ).toISOString()
                  : null,

              updated_at:
                new Date()
                  .toISOString()
            })
        }
      );


      return res
        .status(401)
        .json({
          error:
            shouldLock
              ? "Too many incorrect attempts. PIN locked for 15 minutes."
              : "Incorrect payment PIN"
        });
    }


    /* =========================
       RESET FAILED PIN COUNTER
    ========================= */

    if (
      pinRecord.failed_attempts ||
      pinRecord.locked_until
    ) {
      await fetch(
        `${pinTableUrl}?user_id=eq.${encodeURIComponent(
          user.id
        )}`,
        {
          method:
            "PATCH",

          headers:
            pinHeaders,

          body:
            JSON.stringify({
              failed_attempts:
                0,

              locked_until:
                null,

              updated_at:
                new Date()
                  .toISOString()
            })
        }
      );
    }


    /* =========================
       REQUEST ID
    ========================= */

    requestId =
      createRequestId();

    await validateFixedVariation();

    // Airtime has no fixed plan price to validate. The documented purchase
    // endpoint validates the allowlisted network; a separate provider-list
    // lookup incorrectly blocked purchases on lookup errors or schema changes.

    /* =========================
       ELECTRICITY VERIFY
    ========================= */

    if (
      electricityServices.has(
        serviceID
      )
    ) {
      const verifyResult = await pairgateRequest("/electricity/verify", {
        method: "POST",
        body: JSON.stringify({
          provider_id: serviceID,
          meter_number: String(billersCode),
          meter_type: variation_code === "prepaid" ? 1 : 2
        })
      });
      if (
        !verifyResult.response.ok ||
        verifyResult.data?.status !== "success" ||
        verifyResult.data?.data?.status !== true
      ) {
        return res.status(422).json({
          error: pairgateMessage(verifyResult.data, "Meter verification failed")
        });
      }
    }


    /* =========================
       TV VERIFY
    ========================= */

    if (
      tvServices.has(
        serviceID
      )
    ) {
      const verifyResult = await pairgateRequest("/cable/verify", {
        method: "POST",
        body: JSON.stringify({ provider_id: serviceID, smartcard: String(billersCode) })
      });
      if (
        !verifyResult.response.ok ||
        verifyResult.data?.status !== "success" ||
        verifyResult.data?.data?.status !== true
      ) {
        return res.status(422).json({
          error: pairgateMessage(verifyResult.data, "Smartcard verification failed")
        });
      }
    }


    /* =========================
       DEBIT WALLET
    ========================= */

    const debit =
      await callRpc(
        "debit_wallet",
        {
          p_user_id:
            user.id,

          p_amount:
            paymentAmount,

          p_request_id:
            requestId,

          p_service:
            serviceID,

          p_details: {
            ...((airtimeServices.has(serviceID) || dataServices.has(serviceID)) ? { provider: "pairgate", serviceID } : {}),
            billersCode,

            variation_code:
              variation_code ||
              "",

            phone:
              phone || "",

            email:
              email || "",

            subscription_type:
              subscription_type ||
              "",

            quantity:
              Number(
                quantity || 1
              )
          }
        }
      );


    if (!debit?.success) {
      return res
        .status(402)
        .json({
          error:
            debit?.message ||
            "Wallet debit failed",

          balance:
            Number(
              debit?.new_balance ||
              0
            )
        });
    }


    debitCompleted = true;

    /* =========================
       PAIRGATE RECHARGE e-PINS
    ========================= */

    if (epinServices.has(serviceID)) {
      const network = serviceID.replace(/^epin-/, "");
      const denomination = Number(variation_code);
      const orderQuantity = Number(quantity);

      const available = await pairgateRequest(
        `/recharge-pins/denominations?provider_id=${encodeURIComponent(network)}`,
        { method: "GET" }
      );
      const denominations = pairgateEpinDenominations(available.data, network);
      if (!available.response.ok || available.data?.status !== "success" || !denominations.includes(denomination)) {
        const refund = await refundWallet("Selected recharge-card denomination is unavailable");
        await updateTransaction(refund.success ? "refunded" : "pending", available.data, "pairgate");
        return res.status(409).json({
          error: "This recharge-card denomination is no longer available. Refresh and try again.",
          request_id: requestId,
          refunded: refund.success,
          refund_error: refund.success ? null : refund.message
        });
      }

      providerRequestStarted = true;
      const form = new FormData();
      form.append("provider_id", network);
      form.append("quantity", String(orderQuantity));
      form.append("denomination", String(denomination));
      form.append("reference", requestId);
      const purchase = await pairgateRequest("/epin/purchase", { method: "POST", body: form });
      providerResponseReceived = true;

      const pins = Array.isArray(purchase.data?.data?.pins) ? purchase.data.data.pins : [];
      const delivered = purchase.response.ok && purchase.data?.status === "success" && pins.length === orderQuantity;
      if (!delivered) {
        const refund = await refundWallet(pairgateMessage(purchase.data, "Pairgate rejected the recharge-card purchase"));
        await updateTransaction(refund.success ? "refunded" : "pending", purchase.data, "pairgate");
        return res.status(502).json({
          error: pairgateMessage(purchase.data, "Recharge-card purchase failed"),
          request_id: requestId,
          refunded: refund.success,
          refund_error: refund.success ? null : refund.message,
          wallet: Number.isFinite(refund.balance) ? { balance: refund.balance } : undefined
        });
      }

      const purchasedCode = pins.map((item, index) =>
        `${index + 1}. PIN: ${String(item?.pin || "")} | Serial: ${String(item?.serial || "")}`
      ).join("\n");
      const completedData = { ...purchase.data, purchased_code: purchasedCode };
      await updateTransaction("successful", completedData, "pairgate");
      return res.status(200).json({
        code: "000",
        content: { transactions: { status: "delivered" } },
        request_id: requestId,
        batch_id: String(purchase.data?.data?.batch_id || ""),
        pins,
        purchased_code: purchasedCode,
        wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id }
      });
    }

    /* =========================
       PAIRGATE DATA
    ========================= */

    if (dataServices.has(serviceID)) {
      providerRequestStarted = true;
      const purchase = await pairgateRequest("/data/purchase", {
        method: "POST",
        body: JSON.stringify({
          provider_id: pairgateDataProviderId,
          plan_id: String(variation_code),
          recipient: String(billersCode),
          reference: requestId
        })
      });
      providerResponseReceived = true;
      if (!isPairgateAccepted(purchase.response, purchase.data)) {
        const message = pairgateMessage(purchase.data, "Pairgate response needs confirmation");
        const definitiveRejection = [401, 403, 422, 429].includes(purchase.response.status) && !/duplicate/i.test(message);
        if (!definitiveRejection) {
          acceptedPairgateData = purchase.data;
          await updateTransaction("pending", purchase.data, "pairgate");
          return res.status(202).json({ code: "099", pending: true, request_id: requestId, message: "Provider response needs confirmation. Check history before retrying.", wallet: { balance: Number(debit.new_balance) } });
        }
        const refund = await refundWallet(pairgateMessage(purchase.data, "Pairgate rejected the data purchase"));
        await updateTransaction(refund.success ? "refunded" : "pending", purchase.data, "pairgate");
        return res.status(purchase.response.status >= 400 ? 502 : 400).json({
          error: pairgateMessage(purchase.data, "Data purchase failed"), request_id: requestId,
          refunded: refund.success, refund_error: refund.success ? null : refund.message,
          wallet: Number.isFinite(refund.balance) ? { balance: refund.balance } : undefined
        });
      }
      acceptedPairgateData = purchase.data;
      await updateTransaction("pending", purchase.data, "pairgate");
      const providerReference = pairgateReference(purchase.data);
      if (!providerReference) {
        await updateTransaction("pending", purchase.data, "pairgate");
        return res.status(202).json({ code: "099", pending: true, message: "Data purchase was accepted and is awaiting confirmation", request_id: requestId, wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id } });
      }
      let query, finalStatus = "";
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 1000));
        query = await pairgateRequest(`/transaction/status?reference_code=${encodeURIComponent(providerReference)}`, { method: "GET" });
        finalStatus = pairgateStatus(query.data);
        if ((query.response.ok && isPairgateSuccessfulStatus(finalStatus)) || (query.response.ok && isPairgateFailedStatus(finalStatus))) break;
      }
      const combinedData = { ...purchase.data, data: { ...(purchase.data?.data || {}), ...(query.data?.data || {}), reference_code: providerReference } };
      if (query.response.ok && isPairgateSuccessfulStatus(finalStatus)) {
        await updateTransaction("successful", combinedData, "pairgate");
        return res.status(200).json({ code: "000", content: { transactions: { status: "delivered" } }, request_id: requestId, pairgate_reference: providerReference, pending: false, wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id } });
      }
      if (query.response.ok && isPairgateFailedStatus(finalStatus)) {
        const refund = await refundWallet(pairgateMessage(query.data, "Pairgate data transaction failed"));
        await updateTransaction(refund.success ? "refunded" : "pending", combinedData, "pairgate");
        return res.status(502).json({ error: pairgateMessage(query.data, "Data purchase failed"), request_id: requestId, pairgate_reference: providerReference, refunded: refund.success, refund_error: refund.success ? null : refund.message, wallet: Number.isFinite(refund.balance) ? { balance: refund.balance } : undefined });
      }
      await updateTransaction("pending", combinedData, "pairgate");
      return res.status(202).json({ code: "099", content: { transactions: { status: finalStatus || "pending" } }, request_id: requestId, pairgate_reference: providerReference, pending: true, message: "Data purchase is processing", wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id } });
    }

    /* =========================
       PAIRGATE AIRTIME
    ========================= */

    if (airtimeServices.has(serviceID)) {
      const providerId = serviceID === "etisalat" ? "9mobile" : serviceID;

      providerRequestStarted = true;
      const purchase = await pairgateRequest("/airtime/purchase", {
        method: "POST",
        body: JSON.stringify({
          provider_id: providerId,
          amount: paymentAmount,
          recipient: String(billersCode),
          reference: requestId
        })
      });
      providerResponseReceived = true;

      if (!isPairgateAccepted(purchase.response, purchase.data)) {
        const message = pairgateMessage(purchase.data, "Pairgate response needs confirmation");
        const definitiveRejection = [401, 403, 422, 429].includes(purchase.response.status) && !/duplicate/i.test(message);
        if (!definitiveRejection) {
          acceptedPairgateData = purchase.data;
          await updateTransaction("pending", purchase.data, "pairgate");
          return res.status(202).json({ code: "099", pending: true, request_id: requestId, message: "Provider response needs confirmation. Check history before retrying.", wallet: { balance: Number(debit.new_balance) } });
        }
        const refund = await refundWallet(pairgateMessage(purchase.data, "Pairgate rejected the airtime purchase"));
        await updateTransaction(refund.success ? "refunded" : "pending", purchase.data, "pairgate");
        return res.status(purchase.response.status >= 400 ? 502 : 400).json({
          error: pairgateMessage(purchase.data, "Airtime purchase failed"),
          request_id: requestId,
          refunded: refund.success,
          refund_error: refund.success ? null : refund.message,
          wallet: Number.isFinite(refund.balance) ? { balance: refund.balance } : undefined
        });
      }

      acceptedPairgateData = purchase.data;
      await updateTransaction("pending", purchase.data, "pairgate");
      const providerReference = pairgateReference(purchase.data);
      if (!providerReference) {
        await updateTransaction("pending", purchase.data, "pairgate");
        return res.status(202).json({
          code: "099",
          pending: true,
          message: "Airtime purchase was accepted and is awaiting confirmation",
          request_id: requestId,
          wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id }
        });
      }

      // Pairgate accepts airtime immediately, but its status endpoint can remain
      // "processing" for a few seconds even when delivery succeeds. Poll briefly
      // on the server so the customer receives the real final result instead of
      // an avoidable pending screen.
      let query;
      let finalStatus = "";
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        query = await pairgateRequest(
          `/transaction/status?reference_code=${encodeURIComponent(providerReference)}`,
          { method: "GET" }
        );
        finalStatus = pairgateStatus(query.data);
        if (
          (query.response.ok && isPairgateSuccessfulStatus(finalStatus)) ||
          (query.response.ok && isPairgateFailedStatus(finalStatus))
        ) {
          break;
        }
      }
      const combinedData = {
        ...purchase.data,
        data: {
          ...(purchase.data?.data || {}),
          ...(query.data?.data || {}),
          reference_code: providerReference
        }
      };

      if (query.response.ok && isPairgateSuccessfulStatus(finalStatus)) {
        await updateTransaction("successful", combinedData, "pairgate");
        return res.status(200).json({
          code: "000",
          content: { transactions: { status: "delivered" } },
          request_id: requestId,
          pairgate_reference: providerReference,
          pending: false,
          wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id }
        });
      }

      if (query.response.ok && isPairgateFailedStatus(finalStatus)) {
        const refund = await refundWallet(pairgateMessage(query.data, "Pairgate airtime transaction failed"));
        await updateTransaction(refund.success ? "refunded" : "pending", combinedData, "pairgate");
        return res.status(502).json({
          error: pairgateMessage(query.data, "Airtime purchase failed"),
          request_id: requestId,
          pairgate_reference: providerReference,
          refunded: refund.success,
          refund_error: refund.success ? null : refund.message,
          wallet: Number.isFinite(refund.balance) ? { balance: refund.balance } : undefined
        });
      }

      await updateTransaction("pending", combinedData, "pairgate");
      return res.status(202).json({
        code: "099",
        content: { transactions: { status: finalStatus || "pending" } },
        request_id: requestId,
        pairgate_reference: providerReference,
        pending: true,
        message: "Airtime purchase is processing",
        wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id }
      });
    }

    /* =========================
       PAIRGATE ELECTRICITY
    ========================= */

    if (electricityServices.has(serviceID)) {
      providerRequestStarted = true;
      const purchase = await pairgateRequest("/electricity/purchase", {
        method: "POST",
        body: JSON.stringify({
          provider_id: serviceID,
          amount: paymentAmount,
          meter_number: String(billersCode),
          meter_type: variation_code === "prepaid" ? 1 : 2,
          recipient_name: String(recipient_name || "Verified customer"),
          reference: requestId
        })
      });
      providerResponseReceived = true;

      if (!isPairgateAccepted(purchase.response, purchase.data)) {
        const refund = await refundWallet(pairgateMessage(purchase.data, "Pairgate rejected the electricity payment"));
        await updateTransaction(refund.success ? "refunded" : "pending", purchase.data, "pairgate");
        return res.status(purchase.response.status >= 400 ? 502 : 400).json({
          error: pairgateMessage(purchase.data, "Electricity payment failed"),
          request_id: requestId,
          refunded: refund.success,
          refund_error: refund.success ? null : refund.message,
          wallet: Number.isFinite(refund.balance) ? { balance: refund.balance } : undefined
        });
      }

      const providerReference = pairgateReference(purchase.data);
      const acceptedData = {
        ...purchase.data,
        data: { ...(purchase.data?.data || {}), reference_code: providerReference }
      };
      await updateTransaction("pending", acceptedData, "pairgate");

      if (!providerReference) {
        return res.status(202).json({
          code: "099", pending: true,
          message: "Electricity payment was accepted and the token is being generated",
          request_id: requestId,
          wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id }
        });
      }

      let query;
      let finalStatus = "";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 500));
        query = await pairgateRequest(
          `/transaction/status?reference_code=${encodeURIComponent(providerReference)}`,
          { method: "GET" }
        );
        finalStatus = pairgateStatus(query.data);
        if (
          (query.response.ok && isPairgateSuccessfulStatus(finalStatus)) ||
          (query.response.ok && isPairgateFailedStatus(finalStatus))
        ) break;
      }

      const combinedData = {
        ...purchase.data,
        data: {
          ...(purchase.data?.data || {}),
          ...(query?.data?.data || {}),
          reference_code: providerReference
        },
        purchased_code: String(
          query?.data?.data?.pin || query?.data?.data?.token ||
          purchase.data?.data?.pin || purchase.data?.data?.token || ""
        )
      };

      if (query?.response?.ok && isPairgateSuccessfulStatus(finalStatus)) {
        await updateTransaction("successful", combinedData, "pairgate");
        return res.status(200).json({
          code: "000",
          content: { transactions: { status: "delivered" } },
          purchased_code: combinedData.purchased_code,
          request_id: requestId,
          pairgate_reference: providerReference,
          pending: false,
          wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id }
        });
      }

      if (query?.response?.ok && isPairgateFailedStatus(finalStatus)) {
        const refund = await refundWallet(pairgateMessage(query.data, "Pairgate electricity transaction failed"));
        await updateTransaction(refund.success ? "refunded" : "pending", combinedData, "pairgate");
        return res.status(502).json({
          error: pairgateMessage(query.data, "Electricity payment failed"),
          request_id: requestId,
          pairgate_reference: providerReference,
          refunded: refund.success,
          refund_error: refund.success ? null : refund.message,
          wallet: Number.isFinite(refund.balance) ? { balance: refund.balance } : undefined
        });
      }

      await updateTransaction("pending", combinedData, "pairgate");
      return res.status(202).json({
        code: "099",
        content: { transactions: { status: finalStatus || "processing" } },
        request_id: requestId,
        pairgate_reference: providerReference,
        pending: true,
        message: "Electricity payment is processing. Your token will appear in Transactions.",
        wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id }
      });
    }

    /* =========================
       PAIRGATE CABLE TV
    ========================= */

    if (tvServices.has(serviceID)) {
      providerRequestStarted = true;
      const purchase = await pairgateRequest("/cable/purchase", {
        method: "POST",
        body: JSON.stringify({
          provider_id: serviceID,
          plan_id: String(variation_code),
          smartcard: String(billersCode),
          recipient_name: String(recipient_name || "Verified customer"),
          reference: requestId
        })
      });
      providerResponseReceived = true;

      if (!isPairgateAccepted(purchase.response, purchase.data)) {
        const refund = await refundWallet(pairgateMessage(purchase.data, "Pairgate rejected the TV subscription"));
        await updateTransaction(refund.success ? "refunded" : "pending", purchase.data, "pairgate");
        return res.status(purchase.response.status >= 400 ? 502 : 400).json({
          error: pairgateMessage(purchase.data, "TV subscription failed"),
          request_id: requestId,
          refunded: refund.success,
          refund_error: refund.success ? null : refund.message,
          wallet: Number.isFinite(refund.balance) ? { balance: refund.balance } : undefined
        });
      }

      const providerReference = pairgateReference(purchase.data);
      const acceptedData = {
        ...purchase.data,
        data: { ...(purchase.data?.data || {}), reference_code: providerReference }
      };
      await updateTransaction("pending", acceptedData, "pairgate");

      if (!providerReference) {
        return res.status(202).json({
          code: "099", pending: true,
          message: "TV subscription was accepted and is awaiting confirmation",
          request_id: requestId,
          wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id }
        });
      }

      let query;
      let finalStatus = "";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 500));
        query = await pairgateRequest(
          `/transaction/status?reference_code=${encodeURIComponent(providerReference)}`,
          { method: "GET" }
        );
        finalStatus = pairgateStatus(query.data);
        if (
          (query.response.ok && isPairgateSuccessfulStatus(finalStatus)) ||
          (query.response.ok && isPairgateFailedStatus(finalStatus))
        ) break;
      }

      const combinedData = {
        ...purchase.data,
        data: {
          ...(purchase.data?.data || {}),
          ...(query?.data?.data || {}),
          reference_code: providerReference
        }
      };

      if (query?.response?.ok && isPairgateSuccessfulStatus(finalStatus)) {
        await updateTransaction("successful", combinedData, "pairgate");
        return res.status(200).json({
          code: "000",
          content: { transactions: { status: "delivered" } },
          request_id: requestId,
          pairgate_reference: providerReference,
          pending: false,
          wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id }
        });
      }

      if (query?.response?.ok && isPairgateFailedStatus(finalStatus)) {
        const refund = await refundWallet(pairgateMessage(query.data, "Pairgate TV transaction failed"));
        await updateTransaction(refund.success ? "refunded" : "pending", combinedData, "pairgate");
        return res.status(502).json({
          error: pairgateMessage(query.data, "TV subscription failed"),
          request_id: requestId,
          pairgate_reference: providerReference,
          refunded: refund.success,
          refund_error: refund.success ? null : refund.message,
          wallet: Number.isFinite(refund.balance) ? { balance: refund.balance } : undefined
        });
      }

      await updateTransaction("pending", combinedData, "pairgate");
      return res.status(202).json({
        code: "099",
        content: { transactions: { status: finalStatus || "processing" } },
        request_id: requestId,
        pairgate_reference: providerReference,
        pending: true,
        message: "TV subscription is processing",
        wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id }
      });
    }

    /* =========================
       PAIRGATE EDUCATION PIN
    ========================= */

    if (educationServices.has(serviceID)) {
      providerRequestStarted = true;
      const purchase = await pairgateRequest("/education/purchase", {
        method: "POST",
        body: JSON.stringify({
          provider_id: serviceID,
          quantity: 1,
          reference: requestId
        })
      });
      providerResponseReceived = true;

      if (!isPairgateAccepted(purchase.response, purchase.data)) {
        const refund = await refundWallet(pairgateMessage(purchase.data, "Pairgate rejected the education PIN purchase"));
        await updateTransaction(refund.success ? "refunded" : "pending", purchase.data, "pairgate");
        return res.status(purchase.response.status >= 400 ? 502 : 400).json({
          error: pairgateMessage(purchase.data, "Education PIN purchase failed"),
          request_id: requestId,
          refunded: refund.success,
          refund_error: refund.success ? null : refund.message,
          wallet: Number.isFinite(refund.balance) ? { balance: refund.balance } : undefined
        });
      }

      const detailRows = Array.isArray(purchase.data?.data?.details) ? purchase.data.data.details : [];
      const providerReference = String(detailRows[0]?.reference || "").trim();
      const acceptedData = {
        ...purchase.data,
        data: {
          ...(purchase.data?.data || {}),
          reference_code: providerReference,
          status: "processing"
        }
      };
      await updateTransaction("pending", acceptedData, "pairgate");

      if (!providerReference) {
        return res.status(202).json({
          code: "099", pending: true,
          message: "Education PIN purchase was accepted and the PIN is being generated",
          request_id: requestId,
          wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id }
        });
      }

      let query;
      let finalStatus = "";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 500));
        query = await pairgateRequest(
          `/transaction/status?reference_code=${encodeURIComponent(providerReference)}`,
          { method: "GET" }
        );
        finalStatus = pairgateStatus(query.data);
        if (
          (query.response.ok && isPairgateSuccessfulStatus(finalStatus)) ||
          (query.response.ok && isPairgateFailedStatus(finalStatus))
        ) break;
      }

      const purchasedCode = String(query?.data?.data?.pin || query?.data?.pin || "").trim();
      const combinedData = {
        ...purchase.data,
        data: {
          ...(purchase.data?.data || {}),
          ...(query?.data?.data || {}),
          reference_code: providerReference
        },
        purchased_code: purchasedCode
      };

      if (query?.response?.ok && isPairgateFailedStatus(finalStatus)) {
        const refund = await refundWallet(pairgateMessage(query.data, "Pairgate education transaction failed"));
        await updateTransaction(refund.success ? "refunded" : "pending", combinedData, "pairgate");
        return res.status(502).json({
          error: pairgateMessage(query.data, "Education PIN purchase failed"),
          request_id: requestId,
          pairgate_reference: providerReference,
          refunded: refund.success,
          refund_error: refund.success ? null : refund.message,
          wallet: Number.isFinite(refund.balance) ? { balance: refund.balance } : undefined
        });
      }

      if (query?.response?.ok && isPairgateSuccessfulStatus(finalStatus) && purchasedCode) {
        await updateTransaction("successful", combinedData, "pairgate");
        return res.status(200).json({
          code: "000",
          content: { transactions: { status: "delivered" } },
          purchased_code: purchasedCode,
          request_id: requestId,
          pairgate_reference: providerReference,
          pending: false,
          wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id }
        });
      }

      await updateTransaction("pending", combinedData, "pairgate");
      return res.status(202).json({
        code: "099",
        content: { transactions: { status: finalStatus || "processing" } },
        request_id: requestId,
        pairgate_reference: providerReference,
        pending: true,
        message: "Your education PIN is being generated and will appear in Transactions.",
        wallet: { balance: Number(debit.new_balance), transaction_id: debit.transaction_id }
      });
    }


    /* =========================
       BUILD VTPASS PAYLOAD
    ========================= */

    const vtpassPayload = {
      request_id:
        requestId,

      serviceID: providerServiceID,

      billersCode,

      variation_code:
        variation_code || "",

      amount:
        paymentAmount,

      phone:
        phone ||
        billersCode,

      ...(email && !/^sandbox@/i.test(String(email)) ? { email: String(email) } : {})
    };


    /* TV specific fields */

    if (
      tvServices.has(
        serviceID
      )
    ) {
      vtpassPayload
        .subscription_type =
          subscription_type ||
          "change";

      vtpassPayload.quantity =
        Number(
          quantity || 1
        );
    }


    /* Education quantity */

    if (
      educationServices.has(
        serviceID
      )
    ) {
      vtpassPayload.quantity =
        Number(
          quantity || 1
        );
    }


    /* =========================
       SEND PAYMENT TO VTPASS
    ========================= */

    providerRequestStarted = true;

    const vtpassResponse =
      await fetch(
        `${vtpassBaseUrl}/pay`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            "api-key":
              vtpassApiKey,

            "secret-key":
              vtpassSecretKey
          },

          body:
            JSON.stringify(
              vtpassPayload
            )
        }
      );

    providerResponseReceived = true;


    const responseText =
      await vtpassResponse.text();


    let vtpassData;


    try {
      vtpassData =
        responseText
          ? JSON.parse(
              responseText
            )
          : {};
    } catch {
      vtpassData = {
        response_description:
          responseText
      };
    }


    const providerCode =
      String(
        vtpassData?.code ||
        ""
      );


    const providerStatus = String(
      vtpassData?.content?.transactions?.status || ""
    ).toLowerCase();

    const delivered =
      vtpassResponse.ok &&
      providerCode === "000" &&
      providerStatus === "delivered";

    const pending =
      providerCode === "099" ||
      (providerCode === "000" && providerStatus !== "delivered");

    const definitiveFailureCodes = new Set([
      "010", "011", "012", "013", "014", "015", "016", "017",
      "018", "032", "034", "035", "040", "083", "087", "091"
    ]);


    /* =========================
       PROVIDER REJECTED
       REFUND WALLET
    ========================= */

    if (
      definitiveFailureCodes.has(providerCode)
    ) {

      const refund =
        await refundWallet(
          vtpassData
            ?.response_description ||
          vtpassData
            ?.message ||
          "VTpass rejected the payment"
        );

      await updateTransaction(refund.success ? "refunded" : "pending", vtpassData);


      return res
        .status(502)
        .json({
          error:
            vtpassData
              ?.response_description ||
            vtpassData
              ?.message ||
            "Provider payment failed",

          request_id:
            requestId,

          refunded:
            refund.success,

          refund_error:
            refund.success
              ? null
              : refund.message,

          wallet:
            Number.isFinite(
              refund.balance
            )
              ? {
                  balance:
                    refund.balance
                }
              : undefined
        });
    }

    if (delivered) {
      await updateTransaction("successful", vtpassData);
      return res.status(200).json({
        ...vtpassData,
        request_id: requestId,
        pending: false,
        wallet: {
          balance: Number(debit.new_balance),
          transaction_id: debit.transaction_id
        }
      });
    }

    // VTpass requires every unclear, unexpected, timeout-like, 099, initiated
    // or pending response to be treated as pending and requeried. Never refund
    // here because the provider may still deliver the service.
    await updateTransaction("pending", vtpassData);

    return res.status(202).json({
      ...vtpassData,
      code: providerCode || "099",
      request_id: requestId,
      pending: true,
      message: vtpassData?.response_description || "Transaction is processing",
      wallet: {
        balance: Number(debit.new_balance),
        transaction_id: debit.transaction_id
      }
    });


    /* =========================
       SUCCESS / PENDING
    ========================= */

  } catch (error) {

    console.error(
      "SECURE PAYMENT ERROR:",
      error
    );


    if (debitCompleted && providerRequestStarted && (!providerResponseReceived || airtimeServices.has(serviceID) || dataServices.has(serviceID))) {
      await updateTransaction("pending", acceptedPairgateData || {
        code: "099", response_description: error.message
      }, (airtimeServices.has(serviceID) || dataServices.has(serviceID)) ? "pairgate" : "vtpass");
      return res.status(202).json({
        error: "Provider response is pending confirmation",
        message: "The request may still be processing. Check transaction history before trying again.",
        request_id: requestId,
        pending: true,
        refunded: false
      });
    }

    if (!debitCompleted) {
      if (error?.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
      return res.status(Number(error?.statusCode) || 500).json({
        error: error.message || "Payment validation failed",
        request_id: requestId || null,
        refunded: false
      });
    }

    const refund = await refundWallet(error.message);


    return res
      .status(Number(error?.statusCode) || 500)
      .json({
        error:
          "Secure payment failed",

        message:
          error.message,

        request_id:
          requestId ||
          null,

        refunded:
          refund.success,

        refund_error:
          refund.success
            ? null
            : refund.message,

        wallet:
          Number.isFinite(
            refund.balance
          )
            ? {
                balance:
                  refund.balance
              }
            : undefined
      });
  }
  } 


