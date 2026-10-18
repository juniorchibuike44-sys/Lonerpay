-- Read-only review and cost metadata updates. Never credits or debits a wallet.
begin;
create or replace function public.lp_profit_candidates(p_after text default null)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
select jsonb_build_object(
 'missing_costs',count(*) filter(where transaction_type='debit' and status='successful' and not(coalesce(details->>'provider_cost','') ~ '^[0-9]+([.][0-9]+)?$')),
 'pending_count',count(*) filter(where transaction_type='debit' and status='pending'),
 'pending_amount',coalesce(sum(amount) filter(where transaction_type='debit' and status='pending'),0),
 'failed_debits',count(*) filter(where transaction_type='debit' and status='failed'),
 'refunded_debits',count(*) filter(where transaction_type='debit' and status='refunded'),
 'missing_reference',count(*) filter(where transaction_type='debit' and status='successful' and details->>'provider'='pairgate' and not(coalesce(details->>'provider_cost','') ~ '^[0-9]+([.][0-9]+)?$') and coalesce(details->>'provider_reference','')=''),
 'pending_transactions',coalesce((select jsonb_agg(to_jsonb(p)) from (select t.request_id,t.amount,t.service,t.created_at,coalesce(u.raw_user_meta_data->>'full_name',u.email,'Name not provided') as customer_name from public.wallet_transactions t left join auth.users u on u.id=t.user_id where t.transaction_type='debit' and t.status='pending' order by t.created_at asc limit 10) p),'[]'::jsonb),
 'candidates',coalesce((select jsonb_agg(to_jsonb(c)) from (
 select request_id,user_id,service,amount,status,details->>'provider_reference' as provider_reference,
 coalesce(details->>'billersCode',details->>'phone') as recipient
 from public.wallet_transactions where transaction_type='debit' and status='successful' and details->>'provider'='pairgate'
 and not(coalesce(details->>'provider_cost','') ~ '^[0-9]+([.][0-9]+)?$') and coalesce(details->>'provider_reference','')<>''
 and (p_after is null or request_id>p_after) order by request_id asc limit 5
 ) c),'[]'::jsonb)
) from public.wallet_transactions;
$$;

create or replace function public.lp_profit_save_cost(p_request text,p_reference text,p_cost numeric,p_source text,p_plan text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.wallet_transactions; existing numeric;
begin
 if p_cost is null or p_cost<0 or p_cost<>round(p_cost,2) or p_cost::text in ('NaN','Infinity','-Infinity') or p_source is null or p_source not in ('pairgate_transaction_balances','pairgate_amount_charged','pairgate_total_amount','pairgate_pin_prices') then raise exception 'Invalid provider cost';end if;
 select * into t from public.wallet_transactions where request_id=p_request and transaction_type='debit' for update;
 if not found or t.details->>'provider' is distinct from 'pairgate' or coalesce(p_reference,'')='' or t.details->>'provider_reference' is distinct from p_reference then raise exception 'Provider transaction does not match';end if;
 if t.status not in ('pending','successful') then return jsonb_build_object('saved',false,'reason','not_active');end if;
 if coalesce(t.details->>'provider_cost','') ~ '^[0-9]+([.][0-9]+)?$' then
  existing:=(t.details->>'provider_cost')::numeric;
  if existing<>p_cost then return jsonb_build_object('saved',false,'reason','cost_conflict');end if;
 end if;
 update public.wallet_transactions set details=coalesce(details,'{}'::jsonb)||jsonb_build_object('provider_cost',p_cost,'gross_profit',round(amount-p_cost,2),'cost_source',p_source,'cost_recorded_at',now())||case when coalesce(p_plan,'')<>'' then jsonb_build_object('plan_name',left(p_plan,200)) else '{}'::jsonb end where request_id=p_request;
 return jsonb_build_object('saved',true,'cost',p_cost,'gross_profit',round(t.amount-p_cost,2));
end $$;
revoke all on function public.lp_profit_candidates(text),public.lp_profit_save_cost(text,text,numeric,text,text) from public,anon,authenticated;
grant execute on function public.lp_profit_candidates(text),public.lp_profit_save_cost(text,text,numeric,text,text) to service_role;
commit;
notify pgrst,'reload schema';
select 'profit-accounting-v1' as installed;
