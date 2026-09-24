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
