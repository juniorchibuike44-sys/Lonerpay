create table if not exists public.lp_payment_disputes (
  id uuid primary key default gen_random_uuid(),
  case_reference text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  transaction_id uuid not null references public.wallet_transactions(id) on delete restrict,
  request_id text not null,
  service text not null,
  amount numeric not null check (amount > 0),
  reason text not null check (reason in ('not_received','pending_too_long','charged_twice','wrong_amount','other')),
  customer_message text not null default '' check (char_length(customer_message) <= 500),
  transaction_status text not null,
  case_status text not null default 'open' check (case_status in ('open','investigating','resolved','closed')),
  resolution text check (resolution is null or resolution in ('refunded','provider_confirmed_delivery','duplicate_case','not_eligible','other')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  provider_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique (user_id, request_id, case_reference)
);

create unique index if not exists lp_payment_disputes_one_active_case
on public.lp_payment_disputes (user_id, request_id)
where case_status in ('open','investigating');

create index if not exists lp_payment_disputes_queue
on public.lp_payment_disputes (case_status, created_at desc);

create index if not exists lp_payment_disputes_user_history
on public.lp_payment_disputes (user_id, created_at desc);

alter table public.lp_payment_disputes enable row level security;
revoke all on table public.lp_payment_disputes from public, anon, authenticated;
grant select on table public.lp_payment_disputes to authenticated;

drop policy if exists "Customers can view their payment disputes" on public.lp_payment_disputes;
create policy "Customers can view their payment disputes"
on public.lp_payment_disputes for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

comment on table public.lp_payment_disputes is
'Auditable customer payment complaints. Wallet refunds remain controlled by provider-confirmed reconciliation.';
