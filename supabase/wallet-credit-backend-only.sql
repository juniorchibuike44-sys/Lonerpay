-- Verified payment handlers use service_role; browsers cannot credit wallets.
begin;
revoke execute on function public.credit_wallet(uuid,numeric,text),public.credit_wallet_from_paystack(uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.credit_wallet(uuid,numeric,text),public.credit_wallet_from_paystack(uuid,text,numeric) to service_role;
commit;
