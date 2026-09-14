export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      status: false,
      message: "Method not allowed"
    });
  }

  try {
    const { account_number, bank_code } = req.body || {};

    if (!/^\d{10}$/.test(account_number || "")) {
      return res.status(400).json({
        status: false,
        message: "Enter a valid 10-digit account number"
      });
    }

    if (!bank_code) {
      return res.status(400).json({
        status: false,
        message: "Bank code is required"
      });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return res.status(500).json({
        status: false,
        message: "Paystack secret key is not configured"
      });
    }

    const url =
      "https://api.paystack.co/bank/resolve" +
      "?account_number=" + encodeURIComponent(account_number) +
      "&bank_code=" + encodeURIComponent(bank_code);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();

    if (!response.ok || !data.status) {
      return res.status(response.status || 400).json({
        status: false,
        message: data.message || "Unable to verify account"
      });
    }

    return res.status(200).json({
      status: true,
      account_number: data.data.account_number,
      account_name: data.data.account_name
    });

  } catch (error) {
    console.error("Account verification error:", error);

    return res.status(500).json({
      status: false,
      message: "Account verification failed"
    });
  }
} 
