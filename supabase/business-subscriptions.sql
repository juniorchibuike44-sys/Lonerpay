-- Business Tools: NGN 1,000 per calendar month, verified Paystack payments only.
begin;
create table if not exists public.lp_business_subscriptions(user_id uuid primary key references auth.users(id) on delete cascade,expires_at timestamptz not null,updated_at timestamptz not null default now());
create table if not exists public.lp_business_subscription_payments(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,email text not null,
 reference text unique not null,amount_kobo bigint not null default 100000 check(amount_kobo=100000),currency text not null default 'NGN' check(currency='NGN'),
 status text not null default 'pending' check(status in ('pending','paid','refunded')),checkout_url text,
 provider_id text unique,fees_kobo bigint check(fees_kobo>=0),channel text,paid_at timestamptz,activated_at timestamptz,
 period_start timestamptz,period_end timestamptz,refunded_kobo bigint not null default 0 check(refunded_kobo between 0 and 100000),created_at timestamptz not null default now()
);
create index if not exists lp_business_subscription_owner on public.lp_business_subscription_payments(user_id,created_at desc);
create table if not exists public.lp_business_subscription_refunds(id text primary key,reference text not null references public.lp_business_subscription_payments(reference),amount_kobo bigint not null check(amount_kobo between 1 and 100000),created_at timestamptz not null default now());
alter table public.lp_business_subscriptions enable row level security;
alter table public.lp_business_subscription_payments enable row level security;
alter table public.lp_business_subscription_refunds enable row level security;
revoke all on public.lp_business_subscriptions,public.lp_business_subscription_payments,public.lp_business_subscription_refunds from public,anon,authenticated;
grant all on public.lp_business_subscriptions,public.lp_business_subscription_payments,public.lp_business_subscription_refunds to service_role;

create or replace function public.lp_business_subscription_confirm(p_reference text,p_provider text,p_amount bigint,p_currency text,p_fees bigint,p_channel text,p_paid timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare payment public.lp_business_subscription_payments; until_at timestamptz; start_at timestamptz;
begin
 select * into payment from public.lp_business_subscription_payments where reference=p_reference;
 if not found then raise exception 'Unknown subscription payment'; end if;
 perform pg_advisory_xact_lock(hashtextextended(payment.user_id::text,4));
 select * into payment from public.lp_business_subscription_payments where reference=p_reference for update;
 if p_amount<>100000 or p_currency<>'NGN' or p_provider is null or p_paid is null or p_paid>now()+interval '5 minutes' then raise exception 'Payment details do not match'; end if;
 if payment.status<>'pending' then
  if payment.provider_id<>p_provider then raise exception 'Payment identity changed'; end if;
  return to_jsonb(payment);
 end if;
 select expires_at into until_at from public.lp_business_subscriptions where user_id=payment.user_id for update;
 start_at:=greatest(now(),coalesce(until_at,now()));until_at:=start_at+interval '1 month';
 update public.lp_business_subscription_payments set status='paid',provider_id=p_provider,fees_kobo=p_fees,channel=p_channel,paid_at=p_paid,activated_at=now(),period_start=start_at,period_end=until_at where reference=p_reference returning * into payment;
 insert into public.lp_business_subscriptions(user_id,expires_at) values(payment.user_id,until_at) on conflict(user_id) do update set expires_at=excluded.expires_at,updated_at=now();
 return to_jsonb(payment);
end $$;

create or replace function public.lp_business_subscription_refund(p_reference text,p_refund text,p_amount bigint,p_provider text default null,p_paid timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare payment public.lp_business_subscription_payments; old public.lp_business_subscription_refunds; entry public.lp_business_subscription_payments; until_at timestamptz;
begin
 select * into payment from public.lp_business_subscription_payments where reference=p_reference;
 if not found then raise exception 'Payment not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(payment.user_id::text,4));
 select * into payment from public.lp_business_subscription_payments where reference=p_reference for update;
 select * into old from public.lp_business_subscription_refunds where id=p_refund;
 if found then
  if old.reference<>p_reference or old.amount_kobo<>p_amount then raise exception 'Refund reference already used'; end if;
  return to_jsonb(payment);
 end if;
 if payment.status='pending' then
  if p_provider is null then raise exception 'Refund payment identity is required'; end if;
  update public.lp_business_subscription_payments set provider_id=p_provider,paid_at=coalesce(p_paid,now()) where reference=p_reference returning * into payment;
 end if;
 if p_amount<=0 or p_amount+payment.refunded_kobo>payment.amount_kobo then raise exception 'Check refund amount'; end if;
 insert into public.lp_business_subscription_refunds(id,reference,amount_kobo) values(p_refund,p_reference,p_amount);
 update public.lp_business_subscription_payments set refunded_kobo=refunded_kobo+p_amount,status=case when refunded_kobo+p_amount=amount_kobo then 'refunded' else status end where reference=p_reference returning * into payment;
 -- A full refund removes that month's access; partial goodwill refunds retain it.
 if payment.status='refunded' then
  for entry in select * from public.lp_business_subscription_payments where user_id=payment.user_id and status='paid' order by activated_at,id loop
   until_at:=greatest(entry.activated_at,coalesce(until_at,entry.activated_at))+interval '1 month';
  end loop;
  update public.lp_business_subscriptions set expires_at=coalesce(until_at,now()),updated_at=now() where user_id=payment.user_id;
 end if;
 return to_jsonb(payment);
end $$;

create or replace function public.lp_business_subscription_totals()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object(
 'gross_kobo',coalesce(sum(amount_kobo) filter(where status<>'pending'),0),
 'refunds_kobo',coalesce(sum(refunded_kobo),0),
 'sales_kobo',coalesce(sum(amount_kobo-refunded_kobo) filter(where status<>'pending'),0),
 'month_sales_kobo',coalesce(sum(amount_kobo-refunded_kobo) filter(where status<>'pending' and (paid_at at time zone 'Africa/Lagos')>=date_trunc('month',now() at time zone 'Africa/Lagos')),0),
 'fees_kobo',coalesce(sum(fees_kobo) filter(where status<>'pending'),0),
 'unknown_fee_count',count(*) filter(where status<>'pending' and fees_kobo is null),
 'paid_payments',count(*) filter(where status<>'pending'),'pending_payments',count(*) filter(where status='pending'),
 'active_subscriptions',(select count(*) from public.lp_business_subscriptions where expires_at>now()),
 'expired_subscriptions',(select count(*) from public.lp_business_subscriptions where expires_at<=now())
 ) from public.lp_business_subscription_payments;
$$;
revoke all on function public.lp_business_subscription_confirm(text,text,bigint,text,bigint,text,timestamptz),public.lp_business_subscription_refund(text,text,bigint,text,timestamptz),public.lp_business_subscription_totals() from public,anon,authenticated;
grant execute on function public.lp_business_subscription_confirm(text,text,bigint,text,bigint,text,timestamptz),public.lp_business_subscription_refund(text,text,bigint,text,timestamptz),public.lp_business_subscription_totals() to service_role;
commit;
notify pgrst,'reload schema';
