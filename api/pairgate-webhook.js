import {pairgateAccounting,savePairgateCost} from "./_provider-accounting.js";
import crypto from "crypto";

export const config = {
  api: {
    bodyParser: false,
  },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  try {
    const secret = process.env.PAIRGATE_WEBHOOK_SECRET;

    if (!secret) {
      console.error("PAIRGATE_WEBHOOK_SECRET is missing");

      return res.status(500).json({
        success: false,
        message: "Webhook configuration missing",
      });
    }

    const timestamp = req.headers["x-pairgate-timestamp"];
    const signatureHeader = req.headers["x-pairgate-signature"];

    if (!timestamp || !signatureHeader) {
      console.error("Pairgate webhook signature headers missing");

      return res.status(401).json({
        success: false,
        message: "Missing webhook signature",
      });
    }

    const timestampNumber = Number(timestamp);
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isFinite(timestampNumber) ||
      Math.abs(now - timestampNumber) > 300
    ) {
      return res.status(400).json({
        success: false,
        message: "Webhook timestamp invalid or expired",
      });
    }

    const rawBody = await getRawBody(req);

    const signedPayload =
      String(timestamp) + "." + rawBody.toString("utf8");

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    const providedSignature = String(signatureHeader)
      .trim()
      .toLowerCase();

    const expectedBuffer = Buffer.from(
      expectedSignature,
      "hex"
    );

    const providedBuffer = Buffer.from(
      providedSignature,
      "hex"
    );

    if (
      providedSignature.length !== 64 ||
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      console.error("Pairgate webhook signature mismatch", {
        rawBodyLength: rawBody.length,
        providedSignatureLength: providedSignature.length,
      });

      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    let event;

    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook body",
      });
    }

    console.log("Verified Pairgate webhook", {
      event: event.event,
      reference: event.reference,
      reference_code: event.reference_code,
      status: event.status,
    });

    const status = String(event.status || "")
      .toLowerCase()
      .trim();

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration missing");
    }

    // Always load the original row before merging callbacks, including callbacks
    // that already carry our request reference. Never replace saved receipt facts.
    let matchedTransaction=null;
    if(event.reference||event.reference_code){
      const filter=event.reference?'request_id=eq.'+encodeURIComponent(event.reference):'details-%3E%3Eprovider_reference=eq.'+encodeURIComponent(event.reference_code);
      const lookup=await fetch(`${supabaseUrl}/rest/v1/wallet_transactions?select=user_id,request_id,details,status,amount&transaction_type=eq.debit&${filter}&limit=1`,{headers:{apikey:supabaseKey,Authorization:`Bearer ${supabaseKey}`},cache:'no-store'});
      if(!lookup.ok)throw Error('Original transaction lookup failed');
      const rows=await lookup.json();matchedTransaction=rows[0]||null;
      if(!matchedTransaction)return res.status(200).json({success:true,message:'No matching purchase'});
      if(matchedTransaction.details?.provider!=='pairgate')return res.status(200).json({success:true,message:'Provider does not match'});
      if(event.reference_code&&matchedTransaction.details?.provider_reference&&event.reference_code!==matchedTransaction.details.provider_reference)return res.status(200).json({success:true,message:'Provider reference does not match'});
      event.reference=matchedTransaction.request_id;
    }

    if (status === "successful" && event.reference) {
      const updateResponse = await fetch(
        `${supabaseUrl}/rest/v1/wallet_transactions?request_id=eq.${encodeURIComponent(event.reference)}&status=eq.pending`,
        {
          method: "PATCH",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            status: "successful",
            details:{
              ...(matchedTransaction?.details||{}),
              ...(matchedTransaction?.details?.provider_cost==null?(pairgateAccounting(event,matchedTransaction?.amount)||{}):{}),
              provider:'pairgate',provider_reference:String(event.reference_code||matchedTransaction?.details?.provider_reference||''),provider_status:status,
              ...(event.pin?{purchased_code:String(event.pin)}:{}),
              ...(event.plan?{plan_name:String(event.plan).slice(0,200)}:{})
            },
            updated_at: new Date().toISOString()
          })
        }
      );

      if (!updateResponse.ok) {
        throw new Error("Could not finalize successful Pairgate transaction");
      }
      try{await savePairgateCost({base:supabaseUrl,key:supabaseKey,requestId:event.reference,providerReference:String(event.reference_code||matchedTransaction?.details?.provider_reference||''),facts:pairgateAccounting(event,matchedTransaction?.amount)});}catch{console.error('Provider cost reconciliation is required',{request_id:event.reference});}
    }

    if (status === "failed" && event.reference) {
      if(matchedTransaction?.status==='successful'||matchedTransaction?.status==='refunded')return res.status(200).json({success:true,message:'Purchase already finalized'});
      const transactionResponse = await fetch(
        `${supabaseUrl}/rest/v1/wallet_transactions?request_id=eq.${encodeURIComponent(
          event.reference
        )}&transaction_type=eq.debit&select=user_id&limit=1`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        }
      );

      if (!transactionResponse.ok) {
        throw new Error(
          "Could not find original wallet transaction"
        );
      }

      const transactions =
        await transactionResponse.json();

      const originalTransaction = transactions[0];

      if (!originalTransaction?.user_id) {
        throw new Error(
          "Original wallet transaction not found"
        );
      }

      const refundResponse = await fetch(
        `${supabaseUrl}/rest/v1/rpc/${String(event.reference).startsWith("bulk-") ? "lp_bulk_refund" : "refund_wallet"}`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_user_id: originalTransaction.user_id,
            p_request_id: event.reference,
            p_reason:
              event.message ||
              "Pairgate reported transaction failed",
          }),
        }
      );

      const refundBody=await refundResponse.json().catch(()=>null);
      if (!refundResponse.ok || (Array.isArray(refundBody)?refundBody[0]:refundBody)?.success===false) {
        const refundError =
          JSON.stringify({success:false});

        console.error(
          "refund_wallet failed:",
          refundError
        );

        throw new Error("Wallet refund failed");
      }

      console.log(
        "Pairgate failed transaction refunded",
        {
          reference: event.reference,
          reference_code: event.reference_code,
        }
      );
    }

    return res.status(200).json({
      success: true,
      message: "Webhook received",
    });
  } catch (error) {
    console.error(
      "Pairgate webhook processing error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
} 


