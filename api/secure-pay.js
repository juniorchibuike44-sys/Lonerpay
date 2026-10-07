import { pbkdf2Sync, timingSafeEqual } from "node:crypto";

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
    String(Date.now()).slice(-6)
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
  "aba-electric",
  "abuja-electric",
  "benin-electric",
  "eko-electric",
  "enugu-electric",
  "ibadan-electric",
  "ikeja-electric",
  "jos-electric",
  "kaduna-electric",
  "kano-electric",
  "portharcourt-electric",
  "yola-electric"
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
  "waec-registration",
  "jamb"
]);


const allowedPaymentServices = new Set([
  ...airtimeServices,
  ...dataServices,
  ...electricityServices,
  ...tvServices,
  ...educationServices
]);


/* =========================
   HANDLER
========================= */

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

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

  const authorization =
    req.headers.authorization;


  if (
    !supabaseUrl ||
    !secretKey ||
    !vtpassApiKey ||
    !vtpassSecretKey
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
    pin
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


  let user;

  let requestId;

  let debitCompleted = false;

  let providerRequestStarted = false;

  let providerResponseReceived = false;


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

  async function updateTransaction(status, providerData = {}) {
    if (!user?.id || !requestId) return;
    try {
      await fetch(
        `${supabaseUrl}/rest/v1/wallet_transactions?user_id=eq.${encodeURIComponent(user.id)}&request_id=eq.${encodeURIComponent(requestId)}`,
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
              provider: "vtpass",
              serviceID,
              billersCode,
              variation_code: variation_code || "",
              phone: phone || "",
              provider_code: String(providerData?.code || ""),
              provider_status: String(providerData?.content?.transactions?.status || ""),
              provider_reference: String(providerData?.requestId || providerData?.request_id || ""),
              purchased_code: String(providerData?.purchased_code || providerData?.token || "")
            },
            updated_at: new Date().toISOString()
          })
        }
      );
    } catch (error) {
      console.error("TRANSACTION STATUS UPDATE ERROR:", error);
    }
  }

  async function validateFixedVariation() {
    if (!(dataServices.has(serviceID) || tvServices.has(serviceID))) return;
    const response = await fetch(
      `${vtpassBaseUrl}/service-variations?serviceID=${encodeURIComponent(serviceID)}`,
      {
        headers: {
          "api-key": vtpassApiKey,
          "public-key": vtpassPublicKey,
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );
    const data = await response.json().catch(() => ({}));
    const variations = Array.isArray(data?.content?.variations)
      ? data.content.variations
      : [];
    const selected = variations.find(item =>
      String(item?.variation_code || "") === String(variation_code || "")
    );
    const expectedAmount = Number(selected?.variation_amount);
    if (!response.ok || !selected || !Number.isFinite(expectedAmount) || expectedAmount <= 0) {
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


    /* =========================
       ELECTRICITY VERIFY
    ========================= */

    if (
      electricityServices.has(
        serviceID
      )
    ) {
      const verifyResponse =
        await fetch(
          `${vtpassBaseUrl}/merchant-verify`,
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
              JSON.stringify({
                serviceID,

                billersCode,

                type:
                  variation_code
              })
          }
        );


      const verifyData =
        await verifyResponse.json();


      const verifyContent =
        verifyData?.content || {};


      if (
        !verifyResponse.ok ||
        String(
          verifyData?.code ||
          ""
        ) !== "000" ||
        verifyContent
          .WrongBillersCode ===
          true ||
        verifyContent
          .Can_Vend === "no"
      ) {
        return res
          .status(422)
          .json({
            error:
              verifyData
                ?.response_description ||
              verifyData
                ?.message ||
              "Meter verification failed"
          });
      }


      const providerMinimum =
        Number(
          verifyContent
            .Min_Purchase_Amount ||
          verifyContent
            .Minimum_Amount ||
          0
        );


      if (
        providerMinimum > 0 &&
        paymentAmount <
          providerMinimum
      ) {
        return res
          .status(400)
          .json({
            error:
              `Minimum payment is ₦${providerMinimum.toFixed(
                2
              )}`
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
      const verifyResponse =
        await fetch(
          `${vtpassBaseUrl}/merchant-verify`,
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
              JSON.stringify({
                serviceID,

                billersCode
              })
          }
        );


      const verifyData =
        await verifyResponse.json();


      if (
        !verifyResponse.ok ||
        String(
          verifyData?.code ||
          ""
        ) !== "000" ||
        verifyData
          ?.content
          ?.WrongBillersCode ===
          true
      ) {
        return res
          .status(422)
          .json({
            error:
              verifyData
                ?.response_description ||
              verifyData
                ?.message ||
              "Smartcard verification failed"
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

      await updateTransaction("refunded", vtpassData);


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


    if (debitCompleted && providerRequestStarted && !providerResponseReceived) {
      await updateTransaction("pending", {
        code: "099",
        response_description: error.message
      });
      return res.status(202).json({
        error: "Provider response is pending confirmation",
        message: "The request may still be processing. Check transaction history before trying again.",
        request_id: requestId,
        pending: true,
        refunded: false
      });
    }

    if (!debitCompleted) {
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
