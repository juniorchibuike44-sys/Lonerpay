export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const authorization = req.headers.authorization;

  if (!supabaseUrl || !secretKey) {
    return res.status(500).json({
      error: "Server profile configuration missing"
    });
  }

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Login required"
    });
  }

  try {
    // Verify the logged-in user
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: secretKey,
        Authorization: authorization
      }
    });

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Invalid or expired login"
      });
    }

    const user = await userResponse.json();

    // GET profile
    if (req.method === "GET") {
      return res.status(200).json({
        name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          "",
        phone:
          user.user_metadata?.phone ||
          user.phone ||
          "",
        email: user.email || ""
      });
    }

    // UPDATE profile
    const name =
      typeof req.body?.name === "string"
        ? req.body.name.trim()
        : "";

    const phone =
      typeof req.body?.phone === "string"
        ? req.body.phone.trim()
        : "";

    if (!name || !phone) {
      return res.status(400).json({
        error: "Name and phone number are required"
      });
    }

    const updateResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${user.id}`,
      {
        method: "PUT",
        headers: {
          apikey: secretKey,
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_metadata: {
            ...(user.user_metadata || {}),
            full_name: name,
            phone: phone
          }
        })
      }
    );

    const updated = await updateResponse.json();

    if (!updateResponse.ok) {
      return res.status(updateResponse.status).json({
        error: "Could not update profile"
      });
    }

    return res.status(200).json({
      success: true,
      name,
      phone
    });
  } catch (error) {
    return res.status(500).json({
      error: "Profile request failed"
    });
  }
} 
