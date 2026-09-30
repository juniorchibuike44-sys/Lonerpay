export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const { email, first_name, last_name, phone } = req.body || {};

    if (!email || !first_name || !last_name || !phone) {
      return res.status(400).json({
        success: false,
        message: "Email, first name, last name and phone are required"
      });
    }

  const secretKey = process.env.PAYSTACK_TEST_SECRET_KEY; 

    if (!secretKey) {
      return res.status(500).json({
        success: false,
        message: "Paystack secret key is not configured"
      });
    }

    const response = await fetch(
      "https://api.paystack.co/dedicated_account/assign",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          first_name,
          last_name,
          phone,
          preferred_bank: "test-bank",
          country: "NG"
        })
      }
    );

    const data = await response.json();

    return res.status(response.ok ? 200 : 400).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to create virtual account"
    });
  }
} 
