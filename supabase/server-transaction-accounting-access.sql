-- Server payment completion and owner reports need ledger reads and metadata updates.
-- Amounts, owners and wallet balances remain outside direct UPDATE access.
grant select on table public.wallet_transactions to service_role;
grant update (status, details, updated_at) on table public.wallet_transactions to service_role;
notify pgrst, 'reload schema';
