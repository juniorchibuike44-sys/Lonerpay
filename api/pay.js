export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { serviceID, billersCode, variation_code, amount, phone, email } =
      req.body;
const now = new Date(
  new Date().toLocaleString("en-US", {
    timeZone: "Africa/Lagos"
  })
);

const requestId =
  now.getFullYear().toString() +
  String(now.getMonth() + 1).padStart(2, "0") +
  String(now.getDate()).padStart(2, "0") +
  String(now.getHours()).padStart(2, "0") +
  String(now.getMinutes()).padStart(2, "0") +
  "LONER" +
  Date.now(); 
    const response = await fetch("https://sandbox.vtpass.com/api/pay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.VTPASS_API_KEY,
        "secret-key": process.env.VTPASS_SECRET_KEY
      },
      body: JSON.stringify({
        request_id: requestId, 

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
