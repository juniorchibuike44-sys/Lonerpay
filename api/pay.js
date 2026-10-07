// Retired legacy endpoint. All bill payments must pass through /api/secure-pay
// so login, payment PIN, wallet debit and refund protection cannot be bypassed.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(410).json({
    error: "This payment route has been retired. Use the secure payment flow."
  });
}
