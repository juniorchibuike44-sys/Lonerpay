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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

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

    if (event.event !== "charge.success") {
      return res.status(200).json({
        received: true,
        ignored: true,
      });
    }

    const transaction = event.data;

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

    if (
      !userId ||
      !reference ||
      !Number.isFinite(walletAmount) ||
      walletAmount < 100
    ) {
      return res.status(400).json({
        error: "Invalid wallet funding metadata",
      });
    }

    // Paystack reports amount in kobo.
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
  } catch (error) {
    return res.status(500).json({
      error: "Webhook processing failed",
      message: error.message,
    });
  }
}
