export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({status:false,message:"Method not allowed"});
  }

  const secretKey=process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({status:false,message:"Bank service is not configured"});
  }

  try {
    const banks=[];
    const seen=new Set();

    for (let page=1; page<=10; page+=1) {
      const response=await fetch(
        `https://api.paystack.co/bank?country=nigeria&currency=NGN&enabled_for_verification=true&perPage=100&page=${page}`,
        {
          headers:{Authorization:`Bearer ${secretKey}`},
          cache:"no-store"
        }
      );
      const data=await response.json().catch(()=>({}));

      if (!response.ok || !data.status || !Array.isArray(data.data)) {
        throw new Error(data.message || "Paystack could not provide the bank list");
      }

      for (const bank of data.data) {
        const code=String(bank.code || "").trim();
        const name=String(bank.name || "").trim();
        if (!code || !name || seen.has(code) || bank.active===false || bank.is_deleted===true) continue;
        seen.add(code);
        banks.push({
          code,
          name,
          slug:String(bank.slug || ""),
          type:String(bank.type || "nuban")
        });
      }

      const pageCount=Number(data.meta?.pageCount || 0);
      if (data.data.length<100 || (pageCount && page>=pageCount)) break;
    }

    banks.sort((a,b)=>a.name.localeCompare(b.name));
    res.setHeader("Cache-Control","s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({status:true,banks});
  } catch(error) {
    console.error("BANK LIST ERROR:",error);
    return res.status(502).json({
      status:false,
      message:error.message || "Unable to load available banks"
    });
  }
}
