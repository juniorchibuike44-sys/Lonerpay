-- Additive schema change; existing owner-only RLS policies remain in force.
alter table public.virtual_accounts
  add column if not exists failure_code text,
  add column if not exists failure_reason text;
comment on column public.virtual_accounts.failure_reason is
  'Customer-safe verification guidance only. Never store BVN, raw provider payloads or bank account identifiers here.';
