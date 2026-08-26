export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY;

  const missing = [];

  if (!supabaseUrl) {
    missing.push("SUPABASE_URL");
  }

  if (!supabasePublishableKey) {
    missing.push("SUPABASE_PUBLISHABLE_KEY");
  }

  if (missing.length > 0) {
    return res.status(500).json({
      error: "Supabase configuration is missing",
      missing
    });
  }

  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    supabaseUrl,
    supabasePublishableKey
  });
} 
