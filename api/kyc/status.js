export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  res.setHeader("Cache-Control", "no-store");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    return res.status(500).json({
      success: false,
      error: "Server configuration is missing"
    });
  }

  try {
    // Get the logged-in customer's access token.
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Authentication required"
      });
    }

    const accessToken = authHeader.slice(7).trim();

    // Confirm the token with Supabase.
    const userResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: supabaseSecretKey,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired session"
      });
    }

    const user = await userResponse.json();

    if (!user?.id) {
      return res.status(401).json({
        success: false,
        error: "User not found"
      });
    }

    // Read only this customer's virtual-account/KYC record.
    const accountResponse = await fetch(
      `${supabaseUrl}/rest/v1/virtual_accounts?user_id=eq.${encodeURIComponent(
        user.id
      )}&select=assignment_status,account_number,bank_name&limit=1`,
      {
        headers: {
          apikey: supabaseSecretKey,
          Authorization: `Bearer ${supabaseSecretKey}`
        }
      }
    );

    if (!accountResponse.ok) {
      return res.status(500).json({
        success: false,
        error: "Unable to check verification status"
      });
    }

    const accounts = await accountResponse.json();
    const account = accounts?.[0] || null;

    if (!account) {
      return res.status(200).json({
        success: true,
        status: "not_verified",
        verified: false,
        message: "Identity verification has not been completed."
      });
    }

    const assignmentStatus = String(
      account.assignment_status || ""
    ).toLowerCase();

    let status = "pending";
    let verified = false;
    let message = "Verification is in progress.";

    if (
      assignmentStatus === "identification_success" ||
      assignmentStatus === "assigned"
    ) {
      status = "verified";
      verified = true;
      message = "Identity verification completed successfully.";
    } else if (
      assignmentStatus === "identification_failed" ||
      assignmentStatus === "assignment_failed"
    ) {
      status = "action_required";
      message =
        "Verification was not completed. Please review your information and try again.";
    }

    return res.status(200).json({
      success: true,
      status,
      verified,
      message,
      virtual_account_ready:
        assignmentStatus === "assigned" &&
        Boolean(account.account_number),
      bank_name:
        assignmentStatus === "assigned"
          ? account.bank_name || null
          : null
    });
  } catch (error) {
    console.error("KYC status error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to check verification status"
    });
  }
} 
