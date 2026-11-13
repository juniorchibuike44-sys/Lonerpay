-- Additive staged integration. Does not rewrite Paystack accounts or existing balances.
begin;
create table if not exists public.lp_monnify_accounts (
  user_id uuid not null references auth.users(id),
  mode text not null check (mode in ('sandbox','live')),
  account_reference text not null unique,
  status text not null check (status = 'ACTIVE'),
  accounts jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id,mode)
);
alter table public.lp_monnify_accounts enable row level security;
revoke all on public.lp_monnify_accounts from public,anon,authenticated;
grant select,insert,update on public.lp_monnify_accounts to service_role;

create or replace function public.lp_credit_monnify(p_account text,p_mode text,p_reference text,p_amount numeric)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare owner_id uuid; inserted_id uuid; existing public.wallet_transactions;
begin
  if p_mode is distinct from 'live' or p_amount is null or p_amount<=0 or p_amount>100000000 or p_amount<>round(p_amount,2)
     or p_reference is null or length(p_reference) not between 1 and 200 then raise exception 'Invalid funding confirmation'; end if;
  select user_id into owner_id from public.lp_monnify_accounts where account_reference=p_account and mode=p_mode and status='ACTIVE' for share;
  if owner_id is null then raise exception 'Funding account not found'; end if;
  insert into public.wallet_transactions(user_id,request_id,transaction_type,service,amount,status,details)
  values(owner_id,'MONNIFY:'||p_reference,'credit','monnify_wallet_funding',p_amount,'successful',jsonb_build_object('provider','monnify','reference',p_reference,'account_reference',p_account,'mode',p_mode))
  on conflict(request_id) do nothing returning id into inserted_id;
  if inserted_id is null then
    select * into existing from public.wallet_transactions where request_id='MONNIFY:'||p_reference;
    if existing.user_id is distinct from owner_id or existing.amount is distinct from p_amount or existing.service is distinct from 'monnify_wallet_funding' then raise exception 'Funding reference conflict'; end if;
    return jsonb_build_object('credited',false,'duplicate',true);
  end if;
  insert into public.wallets(user_id,balance,currency) values(owner_id,p_amount,'NGN')
  on conflict(user_id) do update set balance=public.wallets.balance+excluded.balance,updated_at=now();
  return jsonb_build_object('credited',true,'transaction_id',inserted_id);
end $$;
revoke all on function public.lp_credit_monnify(text,text,text,numeric) from public,anon,authenticated;
grant execute on function public.lp_credit_monnify(text,text,text,numeric) to service_role;
grant select,insert on public.wallet_transactions to service_role;
grant select,insert on public.wallets to service_role;
grant update(balance,updated_at) on public.wallets to service_role;
commit;
notify pgrst,'reload schema';
