-- LonerPay customer-data separation. Run once in the Supabase SQL editor.
-- Service-role API routes continue to work; signed-in customers can only access their own rows.

alter table if exists public.wallets enable row level security;
alter table if exists public.wallet_transactions enable row level security;
alter table if exists public.virtual_accounts enable row level security;
alter table if exists public.payment_pins enable row level security;
alter table if exists public.login_pin_devices enable row level security;

drop policy if exists wallets_owner_read on public.wallets;
create policy wallets_owner_read on public.wallets for select to authenticated
using (auth.uid() = user_id);

drop policy if exists wallet_transactions_owner_read on public.wallet_transactions;
create policy wallet_transactions_owner_read on public.wallet_transactions for select to authenticated
using (auth.uid() = user_id);

drop policy if exists virtual_accounts_owner_read on public.virtual_accounts;
create policy virtual_accounts_owner_read on public.virtual_accounts for select to authenticated
using (auth.uid() = user_id);

-- PIN records are never readable or writable directly from a browser.
revoke all on table public.payment_pins from anon, authenticated;
revoke all on table public.login_pin_devices from anon, authenticated;

-- Wallets and transaction ledgers are modified only by trusted server/RPC flows.
revoke insert, update, delete on table public.wallets from anon, authenticated;
revoke insert, update, delete on table public.wallet_transactions from anon, authenticated;
revoke insert, update, delete on table public.virtual_accounts from anon, authenticated;

grant select on table public.wallets to authenticated;
grant select on table public.wallet_transactions to authenticated;
grant select on table public.virtual_accounts to authenticated;
