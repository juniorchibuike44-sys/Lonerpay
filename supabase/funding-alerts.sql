begin;
-- Funding notices are transactional events, not administrator announcements.
alter table public.lp_notifications alter column announcement_id drop not null;
alter table public.lp_notifications add column if not exists funding_transaction_id uuid references public.wallet_transactions(id) on delete cascade;
create unique index if not exists lp_notifications_funding_once on public.lp_notifications(funding_transaction_id) where funding_transaction_id is not null;
create table public.lp_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text unique not null check(length(endpoint)<=2048),
 p256dh text not null, auth text not null,
 updated_at timestamptz not null default now()
);
create index lp_push_subscriptions_owner on public.lp_push_subscriptions(user_id);
create table public.lp_push_jobs (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references public.lp_notifications(id) on delete cascade,
 subscription_id uuid not null references public.lp_push_subscriptions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 state text not null default 'queued' check(state in ('queued','processing','accepted','failed','expired')),
 attempts integer not null default 0,
 available_at timestamptz not null default now(), lease_until timestamptz, claim_token uuid,
 created_at timestamptz not null default now(), unique(notification_id,subscription_id)
);
create index lp_push_jobs_due on public.lp_push_jobs(available_at) where state in ('queued','processing');
alter table public.lp_push_subscriptions enable row level security;
alter table public.lp_push_jobs enable row level security;
revoke all on public.lp_push_subscriptions,public.lp_push_jobs from public,anon,authenticated;
grant all on public.lp_push_subscriptions,public.lp_push_jobs to service_role;
create function public.lp_funding_notice() returns trigger language plpgsql security invoker set search_path='' as $$
declare notice_id uuid; message text;
begin
 if new.transaction_type<>'credit' or new.status<>'successful' or new.service<>'paystack_wallet_funding' or new.amount<=0 then return new; end if;
 message := '₦'||to_char(new.amount,'FM999,999,999,999,990.00')||' has been added to your LonerPay wallet.';
 insert into public.lp_notifications(user_id,title,body,funding_transaction_id)
 values(new.user_id,'Wallet funded',message,new.id)
 on conflict (funding_transaction_id) where funding_transaction_id is not null do nothing returning id into notice_id;
 if notice_id is not null then
  insert into public.lp_push_jobs(notification_id,subscription_id,user_id)
  select notice_id,id,new.user_id from public.lp_push_subscriptions where user_id=new.user_id;
 end if;
 return new;
end $$;
revoke all on function public.lp_funding_notice() from public,anon,authenticated;
create trigger lp_funding_notice after insert or update of status on public.wallet_transactions for each row execute function public.lp_funding_notice();
-- Only the backend can claim delivery jobs. Row locks prevent concurrent sends.
create function public.lp_push_claim(p_claim uuid) returns setof public.lp_push_jobs language plpgsql security invoker set search_path='' as $$
begin
 update public.lp_push_jobs set state='expired' where state in ('queued','processing') and created_at<now()-interval '24 hours';
 return query update public.lp_push_jobs j set state='processing',attempts=attempts+1,claim_token=p_claim,lease_until=now()+interval '2 minutes'
 where j.id in(select q.id from public.lp_push_jobs q where q.attempts<5 and q.created_at>now()-interval '24 hours'
 and ((q.state='queued' and q.available_at<=now()) or(q.state='processing' and q.lease_until<now()))
 order by q.created_at for update skip locked limit 20) returning j.*;
end $$;
revoke all on function public.lp_push_claim(uuid) from public,anon,authenticated;
grant execute on function public.lp_push_claim(uuid) to service_role;
commit;
notify pgrst,'reload schema';
