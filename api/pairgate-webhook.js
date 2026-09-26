import crypto from "crypto";

export const config = {
  api: {
    bodyParser: false,
  },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  try {
    const secret = process.env.PAIRGATE_WEBHOOK_SECRET;

    if (!secret) {
      throw new Error("Pairgate webhook secret is missing");
    }

    const timestamp = req.headers["x-pairgate-timestamp"];
    const providedSignature = req.headers["x-pairgate-signature"];
console.log("Pairgate webhook headers:", {
  hasTimestamp: !!timestamp,
  hasSignature: !!providedSignature
}); 
    if (!timestamp || !providedSignature) {
      return res.status(401).json({
        success: false,
        message: "Missing webhook signature",
      });
    }

    const now = Math.floor(Date.now() / 1000);

    if (Math.abs(now - Number(timestamp)) > 300) {
      return res.status(400).json({
        success: false,
        message: "Webhook expired",
      });
    }

    const rawBody = await getRawBody(req);

    const signedPayload =
      String(timestamp) + "." + rawBody.toString("utf8");

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");
console.log("Pairgate signature check:", {
  expectedLength: expectedSignature.length,
  providedLength: String(providedSignature).length,
  signaturesMatch: expectedSignature === String(providedSignature)
}); 
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const providedBuffer = Buffer.from(
      String(providedSignature),
      "utf8"
    );

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    const event = JSON.parse(rawBody.toString("utf8"));

    console.log("Verified Pairgate webhook:", {
      event: event.event,
      reference: event.reference,
      reference_code: event.reference_code,
      status: event.status,
    });
    // Handle a final failed Pairgate transaction.
    // refund_wallet is idempotent, so repeated webhooks cannot refund twice.
    if (
      String(event.status || "").toLowerCase() === "failed" &&
      event.reference
    ) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SECRET_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error("Supabase configuration missing");
      }

      // Find the original LonerPay debit using Pairgate's client reference.
      const transactionResponse = await fetch(
        `${supabaseUrl}/rest/v1/wallet_transactions?request_id=eq.${encodeURIComponent(
          event.reference
        )}&transaction_type=eq.debit&select=user_id&limit=1`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        }
      );

      if (!transactionResponse.ok) {
        throw new Error("Could not find original wallet transaction");
      }

      const transactions = await transactionResponse.json();
      const originalTransaction = transactions[0];

      if (!originalTransaction?.user_id) {
        throw new Error("Original wallet transaction not found");
      }

      const refundResponse = await fetch(
        `${supabaseUrl}/rest/v1/rpc/refund_wallet`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_user_id: originalTransaction.user_id,
            p_request_id: event.reference,
            p_reason: event.message || "Pairgate reported transaction failed",
          }),
        }
      );

      if (!refundResponse.ok) {
        throw new Error("Wallet refund failed");
      }

      console.log("Pairgate failed transaction processed:", {
        reference: event.reference,
        reference_code: event.reference_code,
      });
  } 
    return res.status(200).json({
      success: true,
      message: "Webhook received",
    });
  } catch (error) {
    console.error("Pairgate webhook error:", error);

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
} 
