begin;
create table if not exists public.lp_monnify_checkouts (
 payment_reference text primary key,
 user_id uuid not null references auth.users(id),
 mode text not null check (mode in ('sandbox','live')),
 amount numeric(14,2) not null check (amount between 100 and 500000),
 status text not null default 'pending' check (status in ('pending','credited','failed')),
 transaction_reference text unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists lp_monnify_checkouts_user_created_idx on public.lp_monnify_checkouts(user_id,created_at desc);
alter table public.lp_monnify_checkouts enable row level security;
revoke all on public.lp_monnify_checkouts from public,anon,authenticated;
grant select,insert,update on public.lp_monnify_checkouts to service_role;
create or replace function public.lp_credit_monnify_checkout(p_payment_reference text,p_mode text,p_reference text,p_amount numeric)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare checkout public.lp_monnify_checkouts; inserted_id uuid; existing public.wallet_transactions;
begin
 if p_mode is distinct from 'live' or p_amount is null or p_amount<=0 or p_amount>500000 or p_amount<>round(p_amount,2) or p_reference is null or length(p_reference) not between 1 and 200 or p_payment_reference is null or length(p_payment_reference) not between 1 and 100 then raise exception 'Invalid checkout confirmation'; end if;
 select * into checkout from public.lp_monnify_checkouts where payment_reference=p_payment_reference and mode=p_mode for update;
 if checkout.user_id is null or checkout.amount is distinct from p_amount then raise exception 'Checkout mapping mismatch'; end if;
 if checkout.transaction_reference is not null and checkout.transaction_reference is distinct from p_reference then raise exception 'Checkout reference conflict'; end if;
 insert into public.wallet_transactions(user_id,request_id,transaction_type,service,amount,status,details)
 values(checkout.user_id,'MONNIFY:'||p_reference,'credit','monnify_checkout_funding',p_amount,'successful',jsonb_build_object('provider','monnify','reference',p_reference,'payment_reference',p_payment_reference,'mode',p_mode))
 on conflict(request_id) do nothing returning id into inserted_id;
 if inserted_id is null then
  select * into existing from public.wallet_transactions where request_id='MONNIFY:'||p_reference;
  if existing.user_id is distinct from checkout.user_id or existing.amount is distinct from p_amount or existing.service is distinct from 'monnify_checkout_funding' then raise exception 'Funding reference conflict'; end if;
  update public.lp_monnify_checkouts set status='credited',transaction_reference=p_reference,updated_at=now() where payment_reference=p_payment_reference;
  return jsonb_build_object('credited',false,'duplicate',true);
 end if;
 insert into public.wallets(user_id,balance,currency) values(checkout.user_id,p_amount,'NGN') on conflict(user_id) do update set balance=public.wallets.balance+excluded.balance,updated_at=now();
 update public.lp_monnify_checkouts set status='credited',transaction_reference=p_reference,updated_at=now() where payment_reference=p_payment_reference;
 return jsonb_build_object('credited',true,'transaction_id',inserted_id);
end $$;
revoke all on function public.lp_credit_monnify_checkout(text,text,text,numeric) from public,anon,authenticated;
grant execute on function public.lp_credit_monnify_checkout(text,text,text,numeric) to service_role;
commit;
notify pgrst,'reload schema';
