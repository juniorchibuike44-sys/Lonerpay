export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const authorization = req.headers.authorization;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      success: false,
      message: "Server authentication is not configured"
    });
  }

  if (!secretKey || !secretKey.startsWith("sk_live_")) {
    return res.status(500).json({
      success: false,
      message: "Paystack is not using a Live Secret Key"
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

    const fullName =
  user.user_metadata?.full_name ||
  user.user_metadata?.name ||
  "";

const nameParts = fullName.trim().split(/\s+/);

const first_name =
  user.user_metadata?.first_name ||
  nameParts[0] ||
  "";

const last_name =
  user.user_metadata?.last_name ||
  nameParts.slice(1).join(" ") ||
  ""; 

    const phone =
      user.user_metadata?.phone ||
      user.phone ||
      "";

    if (!email || !first_name || !last_name || !phone) {
      return res.status(400).json({
        success: false,
        message:
          "Complete your LonerPay profile with your first name, last name and phone number first"
      });
    }

    const {
      bvn,
      account_number,
      bank_code,
      consent
    } = req.body || {};

    if (consent !== true) {
      return res.status(400).json({
        success: false,
        message:
          "Customer consent is required before creating a dedicated virtual account"
      });
    }

    const cleanBvn =
      String(bvn || "").replace(/\D/g, "");

    const cleanAccountNumber =
      String(account_number || "").replace(/\D/g, "");

    const cleanBankCode =
      String(bank_code || "").trim();

    if (!/^\d{11}$/.test(cleanBvn)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 11-digit BVN"
      });
    }

    if (!/^\d{10}$/.test(cleanAccountNumber)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit bank account number"
      });
    }

    if (!cleanBankCode) {
      return res.status(400).json({
        success: false,
        message: "Select the bank linked to this account"
      });
    }
const pendingResponse = await fetch(
  `${supabaseUrl}/rest/v1/virtual_accounts?on_conflict=user_id`,
  {
    method: "POST",
    headers: {
      apikey: supabaseKey, 
      Authorization: `Bearer ${supabaseKey}`, 
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify({
      user_id: user.id,
      customer_email: email,
      assignment_status: "pending",
      updated_at: new Date().toISOString()
    })
  }
);

if (!pendingResponse.ok) {
  const pendingError = await pendingResponse.text();

  return res.status(500).json({
    success: false,
    message: `Could not prepare virtual account request: ${pendingError}`, 
    details: pendingError
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
          preferred_bank: "titan-paystack",
          country: "NG",
          account_number: cleanAccountNumber,
          bvn: cleanBvn,
          bank_code: cleanBankCode
        })
      }
    );

    const data = await response.json();

    if (!response.ok || data?.status === false) {
      return res
        .status(response.status >= 400 ? response.status : 400)
        .json({
          success: false,
          message:
            data?.message ||
            "Paystack could not start virtual account creation"
        });
    }

    return res.status(200).json({
      success: true,
      status: data.status,
      message:
        data.message ||
        "Virtual account creation and customer identification started",
      data: data.data || null
    });

  } catch (error) {
    console.error("Virtual account error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create virtual account"
    });
  }
}
