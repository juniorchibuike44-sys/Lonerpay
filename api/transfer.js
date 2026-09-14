export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      status: false,
      message: "Method not allowed"
    });
  }

  try {
    const {
      account_number,
      bank_code,
      account_name,
      amount
    } = req.body || {};

    if (!/^\d{10}$/.test(account_number || "")) {
      return res.status(400).json({
        status: false,
        message: "Invalid account number"
      });
    }

    if (!bank_code || !account_name) {
      return res.status(400).json({
        status: false,
        message: "Bank details are incomplete"
      });
    }

    const amountNaira = Number(amount);

    if (!Number.isFinite(amountNaira) || amountNaira <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid transfer amount"
      });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return res.status(500).json({
        status: false,
        message: "Paystack is not configured"
      });
    }

    const recipientResponse = await fetch(
      "https://api.paystack.co/transferrecipient",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "nuban",
          name: account_name,
          account_number,
          bank_code: bank_code === "001" ? "057" : bank_code, 
          currency: "NGN"
        })
      }
    );

    const recipientData = await recipientResponse.json();

    if (!recipientResponse.ok || !recipientData.status) {
      return res.status(recipientResponse.status || 400).json({
        status: false,
        message:
          recipientData.message ||
          "Unable to create transfer recipient"
      });
    }

    return res.status(200).json({
      status: true,
      message: "Test recipient created successfully",
      recipient_code: recipientData.data.recipient_code,
      amount: amountNaira
    });

  } catch (error) {
    console.error("Transfer preparation error:", error);

    return res.status(500).json({
      status: false,
      message: "Transfer preparation failed"
    });
  }
} 
