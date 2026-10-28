import nodemailer from "nodemailer";
import { cleanText, enforceSharedRateLimit, hardenResponse, requireUser } from "./_security.js";

const CATEGORIES = new Set(["account", "payment", "transfer", "verification", "security", "other"]);
const RECIPIENTS = ["support@lonerpay.com", "lonerhublimited@gmail.com"];

export default async function handler(req, res) {
  hardenResponse(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!await enforceSharedRateLimit(req, res, { key: "support", limit: 5, windowMs: 10 * 60_000 })) return;
  const auth = await requireUser(req, res);
  if (!auth) return;
  const category = cleanText(req.body?.category, 30).toLowerCase();
  const message = cleanText(req.body?.message, 1200);
  if (!CATEGORIES.has(category) || message.length < 10) {
    return res.status(400).json({ error: "Select a category and provide at least 10 characters." });
  }
  const password = process.env.ZOHO_SMTP_PASSWORD;
  if (!password) return res.status(503).json({
    error: "Support email delivery is temporarily unavailable. Please email support@lonerpay.com directly."
  });
  const reference = `SUP-${Date.now().toString(36).toUpperCase()}-${auth.user.id.slice(0, 6).toUpperCase()}`;
  const email = cleanText(auth.user.email, 254);
  const transport = nodemailer.createTransport({
    host: "smtppro.zoho.com", port: 465, secure: true,
    auth: { user: "support@lonerpay.com", pass: password },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true
  });
  try {
    const result = await transport.sendMail({
      from: { name: "LonerPay Support", address: "support@lonerpay.com" },
      to: RECIPIENTS,
      ...(email && !/[\r\n]/.test(email) ? { replyTo: { address: email } } : {}),
      subject: `[${reference}] LonerPay support: ${category}`,
      text: [
        "New LonerPay support request", "", "Reference: " + reference,
        "Category: " + category, "Customer email: " + (email || "Not provided"),
        "Customer ID: " + auth.user.id, "", message
      ].join("\n")
    });
    if (!result.accepted?.length) throw new Error("NO_RECIPIENT_ACCEPTED");
    if (result.rejected?.length) console.warn("Support email partially accepted", { reference });
  } catch (error) {
    console.error("Support email submission failed", { reference, code: error.code || "SMTP_ERROR" });
    return res.status(502).json({
      error: "We could not confirm email delivery. Please email support@lonerpay.com directly.",
      reference
    });
  } finally {
    transport.close();
  }
  // Retain the existing admin summary; email contains each submitted request.
  try {
    const update = await fetch(`${auth.supabaseUrl}/auth/v1/admin/users/${auth.user.id}`, {
      method: "PUT",
      headers: { apikey: auth.secretKey, Authorization: `Bearer ${auth.secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ app_metadata: { ...(auth.user.app_metadata || {}),
        last_support_request: { reference, category, message, status: "open",
          created_at: new Date().toISOString(), email_status: "accepted" }
      } })
    });
    if (!update.ok) console.error("Support admin summary failed", { reference });
  } catch {
    console.error("Support admin summary failed", { reference });
  }
  return res.status(201).json({ success: true, reference, message: "Support request emailed to the support team." });
}
