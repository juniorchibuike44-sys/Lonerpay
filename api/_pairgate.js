const DEFAULT_BASE_URL = "https://pairgate.com/api/v1";

export function getPairgateConfig() {
  const apiKey = String(process.env.PAIRGATE_API_KEY || "").trim();
  const baseUrl = String(process.env.PAIRGATE_BASE_URL || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, "");

  if (!apiKey) {
    const error = new Error("Pairgate API key is not configured");
    error.statusCode = 500;
    throw error;
  }

  return { apiKey, baseUrl };
}

export async function pairgateRequest(path, options = {}) {
  const { apiKey, baseUrl } = getPairgateConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Cache-Control": "no-cache",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text || "Pairgate returned an invalid response" };
  }

  return { response, data };
}

export function pairgateStatus(data) {
  return String(data?.data?.status || "").trim().toLowerCase();
}

export function pairgateReference(data) {
  return String(data?.data?.reference_code || data?.reference_code || "").trim();
}

export function pairgateMessage(data, fallback = "Pairgate request failed") {
  return String(data?.message || data?.data?.message || fallback);
}

export function isPairgateAccepted(response, data) {
  return Boolean(
    response?.ok &&
    data?.status === "success" &&
    data?.data?.status === true
  );
}

export function isPairgateSuccessfulStatus(status) {
  return ["successful", "success", "completed", "paid", "approved"].includes(
    String(status || "").toLowerCase()
  );
}

export function isPairgateFailedStatus(status) {
  return ["failed", "failure", "rejected", "cancelled", "canceled"].includes(
    String(status || "").toLowerCase()
  );
}
