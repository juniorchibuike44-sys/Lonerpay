import crypto from "crypto";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function updateVirtualAccount(
  supabaseUrl,
  supabaseSecretKey,
  email,
  updates
) {
  if (!email) return false;

  const response = await fetch(
    `${supabaseUrl}/rest/v1/virtual_accounts?customer_email=eq.${encodeURIComponent(
      email
    )}`,
    {
      method: "PATCH",
      headers: {
        apikey: supabaseSecretKey,
        Authorization: `Bearer ${supabaseSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...updates,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!response.ok) {
  const errorText = await response.text();

  console.error("Virtual account Supabase update failed:", {
    status: response.status,
    error: errorText
  });

  return false;
}

return true; 
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!paystackSecretKey || !supabaseUrl || !supabaseSecretKey) {
    return res.status(500).json({
      error: "Webhook configuration is missing",
    });
  }

  try {
    const rawBody = await readRawBody(req);

    const expectedSignature = crypto
      .createHmac("sha512", paystackSecretKey)
      .update(rawBody)
      .digest("hex");

    const receivedSignature = req.headers["x-paystack-signature"];

    if (
      !receivedSignature ||
      receivedSignature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(
        Buffer.from(receivedSignature),
        Buffer.from(expectedSignature)
      )
    ) {
      return res.status(401).json({
        error: "Invalid Paystack signature",
      });
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    const eventType = event.event;
    const eventData = event.data || {};
console.log("Paystack webhook event:", eventType); 
    // -----------------------------------------
    // CUSTOMER IDENTIFICATION
    // -----------------------------------------

    if (eventType === "customeridentification.success") {
      const email =
        eventData.email ||
        eventData.customer?.email ||
        "";

      await updateVirtualAccount(
        supabaseUrl,
        supabaseSecretKey,
        email,
        {
          paystack_customer_code:
            eventData.customer_code ||
            eventData.customer?.customer_code ||
            null,
          assignment_status: "identification_success",
        }
      );

      return res.status(200).json({
        received: true,
        identification: "successful",
      });
    }

    if (eventType === "customeridentification.failed") {
      const email =
        eventData.email ||
        eventData.customer?.email ||
        "";

      await updateVirtualAccount(
        supabaseUrl,
        supabaseSecretKey,
        email,
        {
          paystack_customer_code:
            eventData.customer_code ||
            eventData.customer?.customer_code ||
            null,
          assignment_status: "identification_failed",
        }
      );

      return res.status(200).json({
        received: true,
        identification: "failed",
      });
    }

    // -----------------------------------------
    // DEDICATED VIRTUAL ACCOUNT ASSIGNMENT
    // -----------------------------------------

    if (eventType === "dedicatedaccount.assign.success") {
      const customer = eventData.customer || {};
      const account =
        eventData.dedicated_account ||
        eventData.dedicatedAccount ||
        eventData;

      const bank = account.bank || {};

      const email =
        customer.email ||
        eventData.email ||
        "";

      const accountNumber =
        account.account_number ||
        eventData.account_number ||
        "";

      const accountName =
        account.account_name ||
        eventData.account_name ||
        "";

      const bankName =
        bank.name ||
        eventData.bank?.name ||
        "";

      const bankSlug =
        bank.slug ||
        eventData.bank?.slug ||
        "";

      const dedicatedAccountId =
        account.id ||
        eventData.id ||
        null;

      const customerCode =
        customer.customer_code ||
        eventData.customer_code ||
        null;

      if (!email || !accountNumber) {
        return res.status(200).json({
          received: true,
          warning: "DVA assignment received without matching details",
        });
      }

      const updated = await updateVirtualAccount(
        supabaseUrl,
        supabaseSecretKey,
        email,
        {
          paystack_customer_code: customerCode,
          paystack_dedicated_account_id:
            dedicatedAccountId !== null
              ? String(dedicatedAccountId)
              : null,
          account_number: accountNumber,
          account_name: accountName,
          bank_name: bankName,
          bank_slug: bankSlug,
          assignment_status: "assigned",
        }
      );

      if (!updated) {
        return res.status(500).json({
          error: "Virtual account could not be saved",
        });
      }

      return res.status(200).json({
        received: true,
        virtual_account: "assigned",
      });
    }

    if (eventType === "dedicatedaccount.assign.failed") {
      const customer = eventData.customer || {};

      const email =
        customer.email ||
        eventData.email ||
        "";

      await updateVirtualAccount(
        supabaseUrl,
        supabaseSecretKey,
        email,
        {
          paystack_customer_code:
            customer.customer_code ||
            eventData.customer_code ||
            null,
          assignment_status: "assignment_failed",
        }
      );

      return res.status(200).json({
        received: true,
        virtual_account: "failed",
      });
    }

    // -----------------------------------------
    // SUCCESSFUL PAYMENTS
    // Preserve existing Fund Wallet flow
    // -----------------------------------------

    if (eventType !== "charge.success") {
      return res.status(200).json({
        received: true,
        ignored: true,
      });
    }

    const transaction = eventData;

    if (!transaction || transaction.status !== "success") {
      return res.status(200).json({
        received: true,
        ignored: true,
      });
    }

    let metadata = transaction.metadata || {};

    if (typeof metadata === "string") {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = {};
      }
    }

    const userId = String(metadata.user_id || "").trim();
    const walletAmount = Number(metadata.wallet_amount);
    const reference = String(transaction.reference || "").trim();

    // Existing Fund Wallet payments contain our metadata.
    if (
      userId &&
      reference &&
      Number.isFinite(walletAmount) &&
      walletAmount >= 100
    ) {
      const paidAmount = Number(transaction.amount) / 100;

      if (
        !Number.isFinite(paidAmount) ||
        Math.abs(paidAmount - walletAmount) > 0.01
      ) {
        return res.status(400).json({
          error: "Payment amount does not match wallet amount",
        });
      }

      const creditResponse = await fetch(
        `${supabaseUrl}/rest/v1/rpc/credit_wallet_from_paystack`,
        {
          method: "POST",
          headers: {
            apikey: supabaseSecretKey,
            Authorization: `Bearer ${supabaseSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_user_id: userId,
            p_request_id: reference,
            p_amount: walletAmount,
          }),
        }
      );

      const creditText = await creditResponse.text();

      if (!creditResponse.ok) {
        return res.status(500).json({
          error: "Wallet could not be credited",
          message: creditText,
        });
      }

      return res.status(200).json({
        received: true,
        credited: true,
        reference,
      });
    }

    // -----------------------------------------
    // DVA BANK TRANSFER
    // -----------------------------------------

    const authorization = transaction.authorization || {};

    if (authorization.channel === "dedicated_nuban") {
      const receiverAccount = String(
        authorization.receiver_bank_account_number || ""
      ).trim();

      const amount = Number(transaction.amount) / 100;

      if (
        !receiverAccount ||
        !reference ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          error: "Invalid dedicated account payment",
        });
      }

      const lookupResponse = await fetch(
        `${supabaseUrl}/rest/v1/virtual_accounts?account_number=eq.${encodeURIComponent(
          receiverAccount
        )}&select=user_id&limit=1`,
        {
          headers: {
            apikey: supabaseSecretKey,
            Authorization: `Bearer ${supabaseSecretKey}`,
          },
        }
      );

      if (!lookupResponse.ok) {
        return res.status(500).json({
          error: "Virtual account lookup failed",
        });
      }

      const accounts = await lookupResponse.json();
      const virtualAccountUserId = accounts?.[0]?.user_id;

      if (!virtualAccountUserId) {
        return res.status(400).json({
          error: "Virtual account owner not found",
        });
      }

      const creditResponse = await fetch(
        `${supabaseUrl}/rest/v1/rpc/credit_wallet_from_paystack`,
        {
          method: "POST",
          headers: {
            apikey: supabaseSecretKey,
            Authorization: `Bearer ${supabaseSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_user_id: virtualAccountUserId,
            p_request_id: reference,
            p_amount: amount,
          }),
        }
      );

      const creditText = await creditResponse.text();

      if (!creditResponse.ok) {
        return res.status(500).json({
          error: "Virtual account payment could not be credited",
          message: creditText,
        });
      }

      return res.status(200).json({
        received: true,
        credited: true,
        source: "dedicated_virtual_account",
        reference,
      });
    }

    return res.status(200).json({
      received: true,
      ignored: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Webhook processing failed",
      message: error.message,
    });
  }
        } 
