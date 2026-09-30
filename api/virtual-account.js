export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const authorization = req.headers.authorization;

if (!supabaseUrl || !supabaseKey) {
  return res.status(500).json({
    success: false,
    message: "Server authentication is not configured"
  });
}

if (!authorization?.startsWith("Bearer ")) {
  return res.status(401).json({
    success: false,
    message: "Login required"
  });
} 
  try {
  const token = authorization.slice(7);

const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
  headers: {
    apikey: supabaseKey,
    Authorization: `Bearer ${token}`
  }
});

if (!userResponse.ok) {
  return res.status(401).json({
    success: false,
    message: "Invalid or expired login"
  });
}

const user = await userResponse.json();

const email = user.email;
const first_name =
  user.user_metadata?.first_name ||
  user.user_metadata?.name?.split(" ")[0] ||
  "LonerPay";

const last_name =
  user.user_metadata?.last_name ||
  user.user_metadata?.name?.split(" ").slice(1).join(" ") ||
  "Customer";

const phone =
  user.user_metadata?.phone ||
  user.phone ||
  ""; 
if (!phone) {
  return res.status(400).json({
    success: false,
    message: "Please add your phone number to your LonerPay profile first"
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
