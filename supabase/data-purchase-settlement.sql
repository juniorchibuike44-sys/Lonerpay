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
(v_status = 'successful'),
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
status = case when p_service in ('mtn-data','airtel-data','glo-data','etisalat-data') then 'pending' else 'successful' end,
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

CREATE OR REPLACE FUNCTION public.lp_catalogue_control(p_action text, p_path text, p_owner text, p_payload jsonb DEFAULT NULL::jsonb, p_delay integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
g public.lp_catalogue_gate%rowtype;
c public.lp_catalogue_cache%rowtype;
t timestamptz := clock_timestamp();
begin
select * into g from public.lp_catalogue_gate where id=1 for update;
t := clock_timestamp();
if p_action = 'claim' then
select * into c from public.lp_catalogue_cache where path=p_path;
if found and c.saved_at > t - make_interval(secs=>greatest(1,least(p_delay,600))) then
return jsonb_build_object('state','cached','payload',c.payload);
end if;
if g.cooldown_until > t then
return jsonb_build_object('state','cooldown','retryAfter',ceil(extract(epoch from g.cooldown_until-t)));
end if;
if g.lease_until > t or g.next_at > t then
return jsonb_build_object('state','busy');
end if;
update public.lp_catalogue_gate set owner=p_owner,lease_until=t+interval '30 seconds' where id=1;
return jsonb_build_object('state','acquired');
elsif p_action in ('finish','cooldown') then
if g.owner is distinct from p_owner or g.lease_until <= t then
return jsonb_build_object('state','lost');
end if;
if p_action='finish' and p_payload is not null then
insert into public.lp_catalogue_cache(path,payload,saved_at) values(p_path,p_payload,t)
on conflict(path) do update set payload=excluded.payload,saved_at=excluded.saved_at;
end if;
update public.lp_catalogue_gate set owner=null,lease_until=t,
next_at=t+interval '1500 milliseconds',
cooldown_until=case when p_action='cooldown' then t+make_interval(secs=>greatest(1,least(p_delay,86400))) else cooldown_until end
where id=1;
return jsonb_build_object('state','released');
end if;
raise exception 'Invalid catalogue action';
end $function$;
