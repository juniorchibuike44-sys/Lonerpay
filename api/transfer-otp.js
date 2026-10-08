import { createHmac, timingSafeEqual } from "node:crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: false, message: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  const authorization = req.headers.authorization;

  if (!supabaseUrl || !supabaseKey || !paystackSecretKey) {
    return res.status(500).json({
      status: false,
      message: "Server transfer configuration is missing"
    });
  }

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ status: false, message: "Login required" });
  }

  const otp = String(req.body?.otp || "").replace(/\D/g, "");
  const transferCode = String(req.body?.transfer_code || "").trim();
  const reference = String(req.body?.reference || "").trim();
  const finalizeToken = String(req.body?.finalize_token || "").trim();

  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({ status: false, message: "Enter the 6-digit Paystack OTP" });
  }

  if (!/^TRF_[A-Za-z0-9]+$/.test(transferCode)) {
    return res.status(400).json({ status: false, message: "Invalid transfer code" });
  }

  if (!/^LPTR-[0-9a-f-]{36}$/i.test(reference)) {
    return res.status(400).json({ status: false, message: "Invalid transfer reference" });
  }

  if (!/^[0-9a-f]{64}$/i.test(finalizeToken)) {
    return res.status(403).json({ status: false, message: "Invalid transfer authorization" });
  }

  const token = authorization.slice(7);
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const user = await userResponse.json().catch(() => ({}));

  if (!userResponse.ok || !user?.id) {
    return res.status(401).json({ status: false, message: "Your login has expired" });
  }

  const expectedToken = createHmac("sha256", paystackSecretKey)
    .update(`${user.id}|${reference}|${transferCode}`)
    .digest("hex");
  const suppliedBuffer = Buffer.from(finalizeToken, "hex");
  const expectedBuffer = Buffer.from(expectedToken, "hex");

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return res.status(403).json({ status: false, message: "This transfer cannot be finalized" });
  }

  const paystackResponse = await fetch(
    "https://api.paystack.co/transfer/finalize_transfer",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ transfer_code: transferCode, otp })
    }
  );
  const paystackData = await paystackResponse.json().catch(() => ({}));

  if (!paystackResponse.ok || !paystackData.status) {
    return res.status(paystackResponse.status || 400).json({
      status: false,
      message: paystackData.message || "Paystack could not verify the OTP"
    });
  }

  return res.status(200).json({
    status: true,
    message: paystackData.message || "Transfer OTP verified",
    transfer_status: paystackData.data?.status || "pending",
    reference: paystackData.data?.reference || reference
  });
}
