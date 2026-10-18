-- Run after business-subscription-fees.sql. Read-only company totals, service-role only.
begin;
create or replace function public.lp_admin_finances_v3()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
with costs as (
 select *,case when details->>'provider_cost' ~ '^[0-9]+([.][0-9]+)?$' then (details->>'provider_cost')::numeric end as cost
 from public.wallet_transactions
), sales as (
 select coalesce(sum(amount-cost) filter(where cost is not null),0) as margin,
 count(*) filter(where cost is null) as missing_costs
 from costs where lower(transaction_type)='debit' and lower(status)='successful'
), wallets as (
 select coalesce(sum(greatest(balance,0)),0) as available,count(*) as wallet_count,
 count(*) filter(where balance<0) as negative_wallets,
 count(*) filter(where balance is null) as missing_balances
 from public.wallets
), subscriptions as (
 select coalesce(sum((coalesce(received_kobo,amount_kobo)-fees_kobo-actual_refunded_kobo)::numeric/100) filter(where fees_kobo is not null),0) as net,
 count(*) filter(where fees_kobo is null) as missing_fees
 from public.lp_business_subscription_payments where status<>'pending'
), recent as (
 select user_id,request_id::text as reference,service::text,amount::numeric,status::text,created_at as date,'wallet'::text as source
 from public.wallet_transactions where lower(transaction_type) in ('debit','credit')
 union all
 select user_id,reference,'Business Tools subscription',coalesce(received_kobo,amount_kobo)::numeric/100,status,coalesce(paid_at,created_at),'subscription'
 from public.lp_business_subscription_payments
) , funded as (
 select w.user_id,sum(w.balance) as balance,count(*) as wallet_rows,
 coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),'Name not provided') as customer_name,
 u.email as customer_email,lower(coalesce(u.email,''))='juniorchibuike44@gmail.com' as is_owner
 from public.wallets w left join auth.users u on u.id=w.user_id where w.balance>0
 group by w.user_id,u.raw_user_meta_data,u.email
), breakdown as (
 select * from funded order by balance desc,user_id nulls last limit 100
), purchases as (
 select user_id,request_id::text as reference,service::text,amount::numeric,status::text,created_at as date,
 coalesce(nullif(details->>'plan_name',''),nullif(details->>'variation_name',''),nullif(details->>'bundle','')) as bundle,
 details->>'variation_code' as plan_code
 from public.wallet_transactions where lower(transaction_type)='debit' and lower(status)='successful'
 union all
 select user_id,reference,'Business Tools subscription',coalesce(received_kobo,amount_kobo)::numeric/100,status,coalesce(paid_at,created_at),'One month',null
 from public.lp_business_subscription_payments where status='paid'
), last_purchases as (
 select p.*,coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),'Name not provided') as customer_name,u.email as customer_email
 from (select * from purchases order by date desc nulls last,reference desc limit 3) p
 left join auth.users u on u.id=p.user_id
), latest as (
 select r.*,coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),'Name not provided') as customer_name,u.email as customer_email
 from (select * from recent order by date desc nulls last,reference desc limit 1) r
 left join auth.users u on u.id=r.user_id
)
select jsonb_build_object(
 'schema_version',3,'scope','company','basis','all_time','as_of',now(),
 'customer_available',wallets.available,'wallet_count',wallets.wallet_count,
 'negative_wallets',wallets.negative_wallets,'missing_balances',wallets.missing_balances,
 'service_margin',sales.margin,'subscription_net',subscriptions.net,
 'recorded_profit',sales.margin+subscriptions.net,
 'unpriced_sales',sales.missing_costs,'unknown_subscription_fees',subscriptions.missing_fees,
 'profit_complete',sales.missing_costs=0 and subscriptions.missing_fees=0,
 'latest_transaction',(select to_jsonb(latest) from latest),
 'balance_breakdown',coalesce((select jsonb_agg(to_jsonb(b) order by b.balance desc,b.user_id) from breakdown b),'[]'::jsonb),
 'funded_accounts',(select count(*) from funded),
 'breakdown_other_balance',wallets.available-coalesce((select sum(balance) from breakdown),0),
 'last_purchases',coalesce((select jsonb_agg(to_jsonb(p) order by p.date desc,p.reference desc) from last_purchases p),'[]'::jsonb)
) from wallets cross join sales cross join subscriptions;
$$;
revoke all on function public.lp_admin_finances_v3() from public,anon,authenticated;
grant execute on function public.lp_admin_finances_v3() to service_role;
commit;
notify pgrst,'reload schema';

-- A visible result proves this exact update ran successfully.
select f->>'schema_version' as finance_version, jsonb_typeof(f->'balance_breakdown')='array' as wallet_details_ready, jsonb_typeof(f->'last_purchases')='array' as purchase_details_ready from (select public.lp_admin_finances_v3() as f) checked;
