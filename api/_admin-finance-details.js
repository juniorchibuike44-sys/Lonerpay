// Read-only compatibility for databases returning the original finance summary.
// Uses server credentials only, after the calling endpoint has checked owner access.
export async function completeFinanceDetails(auth, summary) {
  const data={...summary};
  const headers={apikey:auth.secretKey,Authorization:`Bearer ${auth.secretKey}`};
  async function get(path,extra={},signal=AbortSignal.timeout(8000)) {
    const r=await fetch(auth.supabaseUrl+path,{headers:{...headers,...extra},cache:'no-store',signal});
    const body=await r.json();if(!r.ok)throw Error('Source unavailable');return {body,headers:r.headers};
  }
  let wallets=[],purchases=[];
  const work=[];
  if(!Array.isArray(data.balance_breakdown))work.push((async()=>{
    try{
      const q=new URLSearchParams({select:'user_id,balance',balance:'gt.0',order:'balance.desc,user_id.asc',limit:'100'});
      const r=await get('/rest/v1/wallets?'+q,{Prefer:'count=exact'});if(!Array.isArray(r.body))throw Error();
      wallets=r.body.map(w=>({...w,wallet_rows:1}));
      const count=r.headers?.get('content-range')?.split('/')[1];
      data.funded_accounts=count&&/^\d+$/.test(count)?Number(count):wallets.length;
      data.balance_breakdown=wallets;
      const listed=wallets.reduce((s,w)=>s+Math.round(Number(w.balance)*100),0)/100;
      data.breakdown_other_balance=Math.round((Number(data.customer_available)-listed)*100)/100;
      data.balance_snapshot_changed=data.breakdown_other_balance<0;
    }catch{data.balance_breakdown_error='Wallet details could not be read from the connected database. Refresh to retry; no balance was changed.';}
  })());
  if(!Array.isArray(data.last_purchases))work.push((async()=>{
    try{
      const q=new URLSearchParams({select:'user_id,request_id,service,amount,status,created_at,details',transaction_type:'eq.debit',status:'eq.successful',order:'created_at.desc,request_id.desc',limit:'3'});
      const sq=new URLSearchParams({select:'user_id,reference,amount_kobo,received_kobo,status,paid_at,created_at',status:'eq.paid',order:'paid_at.desc,reference.desc',limit:'3'});
      const [w,s]=await Promise.all([get('/rest/v1/wallet_transactions?'+q),get('/rest/v1/lp_business_subscription_payments?'+sq)]);
      if(!Array.isArray(w.body)||!Array.isArray(s.body))throw Error();
      purchases=[...w.body.map(p=>({user_id:p.user_id,reference:p.request_id,service:p.service,amount:p.amount,status:p.status,date:p.created_at,bundle:p.details?.plan_name||p.details?.variation_name||p.details?.bundle||null,plan_code:p.details?.variation_code||null})),...s.body.map(p=>({user_id:p.user_id,reference:p.reference,service:'Business Tools subscription',amount:Number(p.received_kobo??p.amount_kobo)/100,status:p.status,date:p.paid_at||p.created_at,bundle:'One month'}))].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)||String(b.reference).localeCompare(String(a.reference))).slice(0,3);
      data.last_purchases=purchases;
    }catch{data.last_purchases_error='Recent purchases could not be read from the connected database. Refresh to retry.';}
  })());
  await Promise.all(work);
  const ids=[...new Set([...wallets,...purchases].map(x=>x.user_id).filter(Boolean))];
  const names=new Map();let next=0;const namesDeadline=AbortSignal.timeout(6000);
  await Promise.all(Array.from({length:Math.min(8,ids.length)},async()=>{
    while(next<ids.length){const id=ids[next++];try{const {body:u}=await get('/auth/v1/admin/users/'+encodeURIComponent(id),{},namesDeadline);names.set(id,{customer_name:u.user_metadata?.full_name?.trim()||u.user_metadata?.name?.trim()||'Name not provided',customer_email:u.email||'',is_owner:String(u.email||'').toLowerCase()==='juniorchibuike44@gmail.com'});}catch{names.set(id,{customer_name:'Customer name unavailable',customer_email:'',is_owner:false});}}
  }));
  for(const row of [...wallets,...purchases])Object.assign(row,names.get(row.user_id)||{customer_name:'Unlinked wallet',customer_email:'',is_owner:false});
  data.details_version=2;
  return data;
}
