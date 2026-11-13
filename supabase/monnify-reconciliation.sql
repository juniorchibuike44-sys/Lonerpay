begin;
alter table public.wallets add column if not exists funding_hold boolean not null default false;
grant update(funding_hold) on public.wallets to service_role;
create table if not exists public.lp_monnify_inbox (
 id text primary key, reference text not null, event_type text not null,
 payload jsonb not null, state text not null default 'pending' check(state in ('pending','credited','review','ignored')),
 verified jsonb, last_error text, created_at timestamptz not null default now(), checked_at timestamptz not null default now()
);
create index if not exists lp_monnify_inbox_due on public.lp_monnify_inbox(state,checked_at);
create index if not exists lp_monnify_inbox_reference on public.lp_monnify_inbox(reference,event_type);
create table if not exists public.lp_monnify_reviews (
 reference text primary key, user_id uuid not null references auth.users(id), reason text not null,
 state text not null default 'open' check(state in ('open','resolved')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 resolved_by uuid, resolution_note text, resolved_at timestamptz
);
create index if not exists lp_monnify_reviews_owner on public.lp_monnify_reviews(user_id,state);
create table if not exists public.lp_monnify_review_actions (
 id uuid primary key default gen_random_uuid(),reference text not null,actor uuid not null,note text not null,created_at timestamptz not null default now()
);
alter table public.lp_monnify_inbox enable row level security;
alter table public.lp_monnify_reviews enable row level security;
alter table public.lp_monnify_review_actions enable row level security;
revoke all on public.lp_monnify_inbox,public.lp_monnify_reviews from public,anon,authenticated;
grant select,insert,update on public.lp_monnify_inbox,public.lp_monnify_reviews to service_role;
revoke all on public.lp_monnify_review_actions from public,anon,authenticated;
grant select,insert on public.lp_monnify_review_actions to service_role;

create or replace function public.lp_monnify_review(p_reference text,p_reason text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare owner_id uuid; inserted_reference text;
begin
 perform pg_advisory_xact_lock(hashtextextended('monnify:'||p_reference,0));
 select user_id into owner_id from public.wallet_transactions where request_id='MONNIFY:'||p_reference and service='monnify_wallet_funding' and transaction_type='credit';
 if owner_id is null then return false; end if;
 perform 1 from public.wallets where user_id=owner_id for update;
 insert into public.lp_monnify_reviews(reference,user_id,reason) values(p_reference,owner_id,left(p_reason,100))
 on conflict(reference) do update set state='open',reason=excluded.reason,updated_at=now()
 where public.lp_monnify_reviews.state='resolved' and public.lp_monnify_reviews.reason<>excluded.reason
 returning reference into inserted_reference;
 if inserted_reference is not null then
   update public.wallets set funding_hold=true where user_id=owner_id;
   insert into public.lp_notifications(user_id,title,body) values(owner_id,'Funding payment under review','Purchases are temporarily paused while a funding payment is reviewed. Contact LonerPay support. Your balance and history are preserved.');
 end if;
 return true;
end $$;

create or replace function public.lp_monnify_enqueue(p_id text,p_reference text,p_type text,p_payload jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare result text; inserted_id text;
begin
 if length(p_id)>500 or length(p_reference) not between 1 and 200 or p_type not in ('SUCCESSFUL_TRANSACTION','SUCCESSFUL_REFUND','FAILED_REFUND','REJECTED_PAYMENT') then raise exception 'Invalid funding notification'; end if;
 perform pg_advisory_xact_lock(hashtextextended('monnify:'||p_reference,0));
 insert into public.lp_monnify_inbox(id,reference,event_type,payload) values(p_id,p_reference,p_type,p_payload) on conflict(id) do nothing returning id into inserted_id;
 if inserted_id is not null and p_type='SUCCESSFUL_REFUND' then perform public.lp_monnify_review(p_reference,'successful_refund:'||substr(md5(coalesce(p_payload->>'refundReference','')),1,16)); end if;
 select state into result from public.lp_monnify_inbox where id=p_id;
 return result;
end $$;

create or replace function public.lp_monnify_credit_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare ref text;
begin
 if new.service='monnify_wallet_funding' and new.transaction_type='credit' then
   ref:=new.details->>'reference';
   perform pg_advisory_xact_lock(hashtextextended('monnify:'||ref,0));
   if exists(select 1 from public.lp_monnify_inbox where reference=ref and event_type='SUCCESSFUL_REFUND')
      or exists(select 1 from public.lp_monnify_reviews where reference=ref and state='open') then raise exception 'Funding payment requires review'; end if;
 end if;
 return new;
end $$;
drop trigger if exists lp_monnify_credit_guard on public.wallet_transactions;
create trigger lp_monnify_credit_guard before insert on public.wallet_transactions for each row execute function public.lp_monnify_credit_guard();

create or replace function public.lp_wallet_funding_hold_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.funding_hold and new.balance<old.balance then raise exception 'Funding payment under review. Purchases are temporarily paused; contact support.'; end if;
 return new;
end $$;
drop trigger if exists lp_wallet_funding_hold_guard on public.wallets;
create trigger lp_wallet_funding_hold_guard before update of balance on public.wallets for each row execute function public.lp_wallet_funding_hold_guard();

create or replace function public.lp_monnify_resolve_review(p_reference text,p_actor uuid,p_note text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare owner_id uuid;
begin
 if length(trim(p_note))<20 or length(p_note)>1000 or p_actor is null then raise exception 'A reconciliation note and actor are required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('monnify:'||p_reference,0));
 select user_id into owner_id from public.lp_monnify_reviews where reference=p_reference and state='open';
 if owner_id is null then return false; end if;
 perform 1 from public.wallets where user_id=owner_id for update;
 insert into public.lp_monnify_review_actions(reference,actor,note) values(p_reference,p_actor,p_note);
 update public.lp_monnify_reviews set state='resolved',resolved_by=p_actor,resolution_note=p_note,resolved_at=now(),updated_at=now() where reference=p_reference and state='open';
 update public.wallets set funding_hold=exists(select 1 from public.lp_monnify_reviews where user_id=owner_id and state='open') where user_id=owner_id;
 return true;
end $$;
revoke all on function public.lp_monnify_review(text,text),public.lp_monnify_enqueue(text,text,text,jsonb),public.lp_monnify_resolve_review(text,uuid,text),public.lp_monnify_credit_guard(),public.lp_wallet_funding_hold_guard() from public,anon,authenticated;
grant execute on function public.lp_monnify_review(text,text),public.lp_monnify_enqueue(text,text,text,jsonb),public.lp_monnify_resolve_review(text,uuid,text) to service_role;
-- Existing credits are audit-only seeds. No balance or historical transaction is rewritten.
insert into public.lp_monnify_inbox(id,reference,event_type,payload,state,checked_at)
select 'legacy:'||request_id,details->>'reference','SUCCESSFUL_TRANSACTION',jsonb_build_object('transactionReference',details->>'reference','amountPaid',amount,'product',jsonb_build_object('type','RESERVED_ACCOUNT','reference',details->>'account_reference')),'credited',now()-interval '10 minutes'
from public.wallet_transactions where service='monnify_wallet_funding' and transaction_type='credit' and status='successful' and details->>'reference' is not null
on conflict(id) do nothing;
commit;
notify pgrst,'reload schema';
