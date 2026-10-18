-- Run after business-subscriptions.sql. Preserve plan price separately from checkout receipts.
begin;
alter table public.lp_business_subscription_payments add column if not exists received_kobo bigint check(received_kobo>=100000);
alter table public.lp_business_subscription_payments add column if not exists requested_kobo bigint check(requested_kobo=100000);
alter table public.lp_business_subscription_payments add column if not exists actual_refunded_kobo bigint not null default 0 check(actual_refunded_kobo>=0);
-- Previously confirmed payments passed an exact NGN 1,000 amount check.
update public.lp_business_subscription_payments set received_kobo=amount_kobo,requested_kobo=amount_kobo where status<>'pending' and received_kobo is null;
update public.lp_business_subscription_payments set actual_refunded_kobo=refunded_kobo where actual_refunded_kobo<refunded_kobo;
create table if not exists public.lp_business_subscription_refund_receipts(id text primary key,reference text not null references public.lp_business_subscription_payments(reference),amount_kobo bigint not null check(amount_kobo>0),created_at timestamptz not null default now());
insert into public.lp_business_subscription_refund_receipts(id,reference,amount_kobo,created_at) select id,reference,amount_kobo,created_at from public.lp_business_subscription_refunds where id !~ ':plan$' on conflict(id) do nothing;
alter table public.lp_business_subscription_refund_receipts enable row level security;
revoke all on public.lp_business_subscription_refund_receipts from public,anon,authenticated;
grant all on public.lp_business_subscription_refund_receipts to service_role;

create or replace function public.lp_business_subscription_confirm_v2(p_reference text,p_provider text,p_amount bigint,p_currency text,p_fees bigint,p_channel text,p_paid timestamptz,p_received bigint,p_requested bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare payment public.lp_business_subscription_payments; ignored jsonb;
begin
 select * into payment from public.lp_business_subscription_payments where reference=p_reference;
 if not found then raise exception 'Unknown subscription payment'; end if;
 perform pg_advisory_xact_lock(hashtextextended(payment.user_id::text,4));
 select * into payment from public.lp_business_subscription_payments where reference=p_reference for update;
 if p_amount<>100000 or p_requested<>100000 or p_received<100000 or p_received is null or p_requested is null or p_received-100000>coalesce(p_fees,0) then raise exception 'Checkout amount and fee do not match'; end if;
 if payment.received_kobo is not null and payment.received_kobo<>p_received then raise exception 'Verified checkout amount changed'; end if;
 ignored:=public.lp_business_subscription_confirm(p_reference,p_provider,p_amount,p_currency,p_fees,p_channel,p_paid);
 update public.lp_business_subscription_payments set received_kobo=p_received,requested_kobo=p_requested where reference=p_reference returning * into payment;
 return to_jsonb(payment);
end $$;

create or replace function public.lp_business_subscription_refund_v2(p_reference text,p_refund text,p_amount bigint,p_provider text default null,p_paid timestamptz default null,p_received bigint default null,p_fees bigint default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare payment public.lp_business_subscription_payments; old public.lp_business_subscription_refund_receipts; received bigint; plan_delta bigint; ignored jsonb;
begin
 select * into payment from public.lp_business_subscription_payments where reference=p_reference;
 if not found then raise exception 'Payment not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(payment.user_id::text,4));
 select * into payment from public.lp_business_subscription_payments where reference=p_reference for update;
 select * into old from public.lp_business_subscription_refund_receipts where id=p_refund;
 if found then
  if old.reference<>p_reference or old.amount_kobo<>p_amount then raise exception 'Refund reference already used'; end if;
  return to_jsonb(payment);
 end if;
 received:=coalesce(payment.received_kobo,p_received,payment.amount_kobo);
 if p_received is not null and (p_received<>received or p_received<100000 or p_received-100000>coalesce(p_fees,payment.fees_kobo,0)) then raise exception 'Refund checkout amount does not match'; end if;
 if p_amount is null or p_amount<=0 or payment.actual_refunded_kobo+p_amount>received then raise exception 'Check refund amount'; end if;
 plan_delta:=least(payment.amount_kobo,payment.actual_refunded_kobo+p_amount)-least(payment.amount_kobo,payment.actual_refunded_kobo);
 if plan_delta>0 then ignored:=public.lp_business_subscription_refund(p_reference,p_refund||':plan',plan_delta,p_provider,p_paid); end if;
 insert into public.lp_business_subscription_refund_receipts(id,reference,amount_kobo) values(p_refund,p_reference,p_amount);
 update public.lp_business_subscription_payments set actual_refunded_kobo=actual_refunded_kobo+p_amount,received_kobo=received,requested_kobo=amount_kobo,fees_kobo=coalesce(fees_kobo,p_fees) where reference=p_reference returning * into payment;
 return to_jsonb(payment);
end $$;

create or replace function public.lp_business_subscription_totals()
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object(
 'gross_kobo',coalesce(sum(coalesce(received_kobo,amount_kobo)) filter(where status<>'pending'),0),
 'refunds_kobo',coalesce(sum(actual_refunded_kobo),0),
 'sales_kobo',coalesce(sum(amount_kobo-refunded_kobo) filter(where status<>'pending'),0),
 'month_sales_kobo',coalesce(sum(amount_kobo-refunded_kobo) filter(where status<>'pending' and (paid_at at time zone 'Africa/Lagos')>=date_trunc('month',now() at time zone 'Africa/Lagos')),0),
 'customer_fees_kobo',coalesce(sum(greatest(0,coalesce(received_kobo,amount_kobo)-amount_kobo)) filter(where status<>'pending'),0),
 'fees_kobo',coalesce(sum(fees_kobo) filter(where status<>'pending'),0),
 'net_known_kobo',coalesce(sum(coalesce(received_kobo,amount_kobo)-fees_kobo-actual_refunded_kobo) filter(where status<>'pending' and fees_kobo is not null),0),
 'unknown_fee_count',count(*) filter(where status<>'pending' and fees_kobo is null),
 'paid_payments',count(*) filter(where status<>'pending'),'pending_payments',count(*) filter(where status='pending'),
 'active_subscriptions',(select count(*) from public.lp_business_subscriptions where expires_at>now()),
 'expired_subscriptions',(select count(*) from public.lp_business_subscriptions where expires_at<=now())
 ) from public.lp_business_subscription_payments;
$$;
revoke all on function public.lp_business_subscription_confirm_v2(text,text,bigint,text,bigint,text,timestamptz,bigint,bigint),public.lp_business_subscription_refund_v2(text,text,bigint,text,timestamptz,bigint,bigint) from public,anon,authenticated;
grant execute on function public.lp_business_subscription_confirm_v2(text,text,bigint,text,bigint,text,timestamptz,bigint,bigint),public.lp_business_subscription_refund_v2(text,text,bigint,text,timestamptz,bigint,bigint) to service_role;
commit;
notify pgrst,'reload schema';
