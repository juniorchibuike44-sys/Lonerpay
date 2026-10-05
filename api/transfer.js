import { pbkdf2Sync, timingSafeEqual, randomUUID } from "node:crypto";

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
      String(pin),
      salt,
      iterations,
      32,
      "sha256"
    );

    const expected = Buffer.from(expectedHex, "hex");

    return (
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      status: false,
      message: "Method not allowed"
    });
  }

  res.setHeader("Cache-Control", "no-store");

  const supabaseUrl = process.env.SUPABASE_URL;

  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  const paystackSecretKey =
    process.env.PAYSTACK_SECRET_KEY;

  const authorization =
    req.headers.authorization;

  if (
    !supabaseUrl ||
    !supabaseKey ||
    !paystackSecretKey
  ) {
    return res.status(500).json({
      status: false,
      message: "Server transfer configuration is missing"
    });
  }

  if (!paystackSecretKey.startsWith("sk_live_")) {
    return res.status(500).json({
      status: false,
      message: "Paystack is not using a Live Secret Key"
    });
  }

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      status: false,
      message: "Login required"
    });
  }

  const {
    account_number,
    bank_code,
    account_name,
    amount,
    pin
  } = req.body || {};

  const cleanAccountNumber =
    String(account_number || "").replace(/\D/g, "");

  const cleanBankCode =
    String(bank_code || "").trim();

  const amountNaira = Number(amount);

  if (!/^\d{10}$/.test(cleanAccountNumber)) {
    return res.status(400).json({
      status: false,
      message: "Invalid account number"
    });
  }

  if (!cleanBankCode) {
    return res.status(400).json({
      status: false,
      message: "Please select a bank"
    });
  }

  if (
    !account_name ||
    !String(account_name).trim()
  ) {
    return res.status(400).json({
      status: false,
      message: "Account name has not been verified"
    });
  }

  if (
    !Number.isFinite(amountNaira) ||
    amountNaira <= 0
  ) {
    return res.status(400).json({
      status: false,
      message: "Invalid transfer amount"
    });
  }

  if (!/^\d{4}$/.test(String(pin || ""))) {
    return res.status(400).json({
      status: false,
      message: "Enter your 4-digit payment PIN"
    });
  }

  let user = null;
  let requestId = null;
  let debitCompleted = false;

  async function callRpc(functionName, body) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/${functionName}`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    const text = await response.text();

    let data = null;

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

  async function refundWallet(reason) {
    if (
      !debitCompleted ||
      !user ||
      !requestId
    ) {
      return {
        success: false,
        message: "No completed debit to refund"
      };
    }

    try {
      const refund = await callRpc(
        "refund_wallet",
        {
          p_user_id: user.id,
          p_request_id: requestId,
          p_reason: reason
        }
      );

      if (refund?.success === false) {
        throw new Error(
          refund.message ||
          "Wallet refund was rejected"
        );
      }

      debitCompleted = false;

      return {
        success: true,
        balance: Number(refund?.new_balance),
        transaction_id:
          refund?.transaction_id || null
      };
    } catch (error) {
      console.error(
        "TRANSFER WALLET REFUND ERROR:",
        error
      );

      return {
        success: false,
        message: error.message
      };
    }
  }

  try {
    // Authenticate LonerPay customer
    const userResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: authorization
        },
        cache: "no-store"
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        status: false,
        message: "Invalid or expired login"
      });
    }

    user = await userResponse.json();

    // Verify existing LonerPay payment PIN
    const pinTableUrl =
      `${supabaseUrl}/rest/v1/payment_pins`;

    const pinHeaders = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    };

    const pinResponse = await fetch(
      `${pinTableUrl}?user_id=eq.${encodeURIComponent(
        user.id
      )}&select=pin_hash,failed_attempts,locked_until`,
      {
        headers: pinHeaders,
        cache: "no-store"
      }
    );

    if (!pinResponse.ok) {
      return res.status(500).json({
        status: false,
        message: "Could not verify payment PIN"
      });
    }

    const pinRecords =
      await pinResponse.json();

    const pinRecord =
      pinRecords[0];

    if (!pinRecord) {
      return res.status(403).json({
        status: false,
        message:
          "Create a payment PIN in My Profile first"
      });
    }

    const lockedUntil =
      pinRecord.locked_until
        ? new Date(pinRecord.locked_until)
        : null;

    if (
      lockedUntil &&
      lockedUntil > new Date()
    ) {
      return res.status(423).json({
        status: false,
        message:
          "PIN is temporarily locked. Try again later."
      });
    }

    if (
      !verifyStoredPin(
        String(pin),
        pinRecord.pin_hash
      )
    ) {
      const failedAttempts =
        Number(
          pinRecord.failed_attempts || 0
        ) + 1;

      const shouldLock =
        failedAttempts >= 5;

      await fetch(
        `${pinTableUrl}?user_id=eq.${encodeURIComponent(
          user.id
        )}`,
        {
          method: "PATCH",
          headers: pinHeaders,
          body: JSON.stringify({
            failed_attempts:
              shouldLock
                ? 0
                : failedAttempts,

            locked_until:
              shouldLock
                ? new Date(
                    Date.now() +
                    15 * 60 * 1000
                  ).toISOString()
                : null,

            updated_at:
              new Date().toISOString()
          })
        }
      );

      return res.status(401).json({
        status: false,

        message:
          shouldLock
            ? "Too many incorrect attempts. PIN locked for 15 minutes."
            : "Incorrect payment PIN"
      });
    }

    // Reset failed PIN attempts after correct PIN
    if (
      pinRecord.failed_attempts ||
      pinRecord.locked_until
    ) {
      await fetch(
        `${pinTableUrl}?user_id=eq.${encodeURIComponent(
          user.id
        )}`,
        {
          method: "PATCH",
          headers: pinHeaders,

          body: JSON.stringify({
            failed_attempts: 0,
            locked_until: null,
            updated_at:
              new Date().toISOString()
          })
        }
      );
    }

    // Unique transfer reference
    requestId =
      `LPTR-${randomUUID()}`;

    // Debit LonerPay wallet securely
    const debit = await callRpc(
      "debit_wallet",
      {
        p_user_id: user.id,
        p_amount: amountNaira,
        p_request_id: requestId,
        p_service: "bank_transfer",

        p_details: {
          bank_code: cleanBankCode,
          account_number:
            cleanAccountNumber,
          account_name:
            String(account_name).trim()
        }
      }
    );

    if (!debit?.success) {
      return res.status(402).json({
        status: false,

        message:
          debit?.message ||
          "Wallet debit failed",

        balance:
          Number(
            debit?.new_balance || 0
          )
      });
    }

    debitCompleted = true;

    // Create Paystack transfer recipient
    const recipientResponse =
      await fetch(
        "https://api.paystack.co/transferrecipient",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${paystackSecretKey}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            type: "nuban",

            name:
              String(account_name).trim(),

            account_number:
              cleanAccountNumber,

            bank_code:
              cleanBankCode,

            currency: "NGN"
          })
        }
      );

    const recipientData =
      await recipientResponse
        .json()
        .catch(() => ({}));

    if (
      !recipientResponse.ok ||
      !recipientData.status
    ) {
      const refund =
        await refundWallet(
          recipientData.message ||
          "Unable to create transfer recipient"
        );

      return res
        .status(
          recipientResponse.status || 502
        )
        .json({
          status: false,

          message:
            recipientData.message ||
            "Unable to create transfer recipient",

          request_id: requestId,

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

    // Initiate REAL Paystack transfer
    const transferResponse =
      await fetch(
        "https://api.paystack.co/transfer",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${paystackSecretKey}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            source: "balance",

            amount:
              Math.round(
                amountNaira * 100
              ),

            recipient:
              recipientData.data
                .recipient_code,

            reason:
              "LonerPay bank transfer",

            reference:
              requestId
          })
        }
      );

    const transferData =
      await transferResponse
        .json()
        .catch(() => ({}));

    if (
      !transferResponse.ok ||
      !transferData.status
    ) {
      const refund =
        await refundWallet(
          transferData.message ||
          "Paystack rejected the transfer"
        );

      return res
        .status(
          transferResponse.status || 502
        )
        .json({
          status: false,

          message:
            transferData.message ||
            "Unable to initiate transfer",

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

    /*
      Paystack has accepted the transfer.

      The final transfer result should later
      be confirmed through Paystack webhook
      events such as success, failure,
      or reversal.
    */

    debitCompleted = false;

    return res.status(200).json({
      status: true,

      message:
        "Transfer submitted successfully",

      request_id:
        requestId,

      transfer_code:
        transferData.data
          ?.transfer_code || null,

      reference:
        transferData.data
          ?.reference ||
        requestId,

      transfer_status:
        transferData.data
          ?.status ||
        "pending",

      wallet: {
        balance:
          Number(
            debit.new_balance
          ),

        transaction_id:
          debit.transaction_id ||
          null
      }
    });

  } catch (error) {
    console.error(
      "TRANSFER ERROR:",
      error
    );

    const refund =
      await refundWallet(
        error.message
      );

    return res.status(500).json({
      status: false,

      message:
        "Transfer failed",

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
}
