export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { serviceID, billersCode, variation_code, amount, phone, email } =
      req.body;

    const response = await fetch("https://sandbox.vtpass.com/api/pay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.VTPASS_API_KEY,
        "secret-key": process.env.VTPASS_SECRET_KEY
      },
      body: JSON.stringify({
        request_id: `LONER_${Date.now()}`,
        serviceID,
        billersCode,
        variation_code,
        amount,
        phone,
        email
      })
    });

    const data = await response.json();
console.log("VTPASS STATUS:", response.status);
console.log("VTPASS RESPONSE:", JSON.stringify(data)); 
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Payment request failed",
      message: error.message
    });
  }
} 
