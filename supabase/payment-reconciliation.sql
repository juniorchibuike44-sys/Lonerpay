CREATE OR REPLACE FUNCTION public.debit_wallet(p_user_id uuid, p_amount numeric, p_request_id text, p_service text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(success boolean, new_balance numeric, transaction_id uuid, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
v_transaction_id uuid;
v_balance numeric;
v_status text;
begin
if p_amount is null or p_amount <= 0 then
return query
select false, null::numeric, null::uuid, 'Invalid amount'::text;
return;
end if;

insert into public.wallet_transactions (
user_id,
request_id,
transaction_type,
service,
amount,
status,
details
)
values (
p_user_id,
p_request_id,
'debit',
p_service,
p_amount,
'pending',
p_details
)
on conflict (request_id) do nothing
returning id into v_transaction_id;

if v_transaction_id is null then
select wt.id, wt.status, w.balance
into v_transaction_id, v_status, v_balance
from public.wallet_transactions wt
join public.wallets w on w.user_id = wt.user_id
where wt.request_id = p_request_id
and wt.user_id = p_user_id;

return query
select
false,
v_balance,
v_transaction_id,
'Request already processed'::text;
return;
end if;

update public.wallets
set
balance = balance - p_amount,
updated_at = now()
where user_id = p_user_id
and balance >= p_amount
returning balance into v_balance;

if v_balance is null then
update public.wallet_transactions
set
status = 'failed',
updated_at = now()
where id = v_transaction_id;

select balance into v_balance
from public.wallets
where user_id = p_user_id;

return query
select
false,
coalesce(v_balance, 0),
v_transaction_id,
'Insufficient wallet balance'::text;
return;
end if;

update public.wallet_transactions
set
status = case when p_details->>'provider' = 'pairgate' or p_service in ('mtn-data','airtel-data','glo-data','etisalat-data') then 'pending' else 'successful' end,
details = details || jsonb_build_object('wallet_debited',true),
updated_at = now()
where id = v_transaction_id;

return query
select
true,
v_balance,
v_transaction_id,
'Wallet debited successfully'::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refund_wallet(p_user_id uuid, p_request_id text, p_reason text DEFAULT 'Provider payment failed'::text)
RETURNS TABLE(success boolean, new_balance numeric, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
v_transaction_id uuid;
v_amount numeric;
v_status text;
v_service text;
v_balance numeric;
begin
select id, amount, status, service
into v_transaction_id, v_amount, v_status, v_service
from public.wallet_transactions
where user_id = p_user_id
and request_id = p_request_id
and transaction_type = 'debit'
for update;

if v_transaction_id is null then
return query
select false, null::numeric, 'Original transaction not found'::text;
return;
end if;

if v_status = 'refunded' then
select balance into v_balance
from public.wallets
where user_id = p_user_id;

return query
select true, v_balance, 'Transaction already refunded'::text;
return;
end if;

if exists (select 1 from public.wallet_transactions where id=v_transaction_id and lower(details->>'provider_status') in ('successful','success','completed','paid','approved','delivered')) then
return query select false, null::numeric, 'Provider delivery already confirmed'::text;
return;
end if;

if v_status <> 'successful' and not (v_status = 'pending' and exists (
select 1 from public.wallet_transactions where id=v_transaction_id and details->>'wallet_debited'='true'
)) then
return query
select false, null::numeric, 'Transaction cannot be refunded'::text;
return;
end if;

update public.wallets
set
balance = balance + v_amount,
updated_at = now()
where user_id = p_user_id
returning balance into v_balance;

update public.wallet_transactions
set
status = 'refunded',
details = details || jsonb_build_object(
'refund_reason',
p_reason
),
updated_at = now()
where id = v_transaction_id;

insert into public.wallet_transactions (
user_id,
request_id,
transaction_type,
service,
amount,
status,
details
)
values (
p_user_id,
p_request_id || ':refund',
'refund',
v_service,
v_amount,
'successful',
jsonb_build_object(
'original_transaction_id',
v_transaction_id,
'reason',
p_reason
)
)
on conflict (request_id) do nothing;

return query
select true, v_balance, 'Wallet refunded successfully'::text;
end;
$function$;


REVOKE ALL ON FUNCTION public.debit_wallet(uuid,numeric,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.debit_wallet(uuid,numeric,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.refund_wallet(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refund_wallet(uuid,text,text) TO service_role;

-- Serialize callback, poller and owner updates against refunds; merge receipt facts.
CREATE OR REPLACE FUNCTION public.lp_pairgate_settle(p_user uuid,p_request text,p_status text,p_details jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.wallet_transactions%rowtype; r record;
BEGIN
SELECT * INTO t FROM public.wallet_transactions WHERE user_id=p_user AND request_id=p_request AND transaction_type='debit' FOR UPDATE;
IF NOT FOUND OR t.details->>'provider' IS DISTINCT FROM 'pairgate' THEN RAISE EXCEPTION 'Purchase not found'; END IF;
IF t.status IN ('refunded','failed') OR (t.status='successful' AND lower(t.details->>'provider_status') IN ('successful','success','completed','paid','approved')) THEN
RETURN jsonb_build_object('resolved',true,'status',t.status);
END IF;
IF p_status NOT IN ('pending','successful','failed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
IF coalesce(t.details->>'provider_reference','')<>'' AND coalesce(p_details->>'provider_reference',t.details->>'provider_reference')<>t.details->>'provider_reference' THEN RAISE EXCEPTION 'Reference mismatch'; END IF;
IF t.status='successful' THEN
UPDATE public.wallet_transactions SET details=coalesce(details,'{}')||jsonb_build_object('wallet_debited',true) WHERE id=t.id;
END IF;
IF p_status='failed' THEN
SELECT * INTO r FROM public.refund_wallet(p_user,p_request,coalesce(p_details->>'provider_message','Provider confirmed failure'));
IF NOT r.success THEN RAISE EXCEPTION 'Refund not confirmed'; END IF;
UPDATE public.wallet_transactions SET details=details||p_details,updated_at=now() WHERE id=t.id;
RETURN jsonb_build_object('resolved',true,'status','refunded');
END IF;
UPDATE public.wallet_transactions SET status=p_status,details=coalesce(details,'{}')||p_details,updated_at=now() WHERE id=t.id;
RETURN jsonb_build_object('resolved',p_status='successful','status',p_status);
END $$;
REVOKE ALL ON FUNCTION public.lp_pairgate_settle(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lp_pairgate_settle(uuid,text,text,jsonb) TO service_role;
