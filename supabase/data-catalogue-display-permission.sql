-- Run in Supabase SQL Editor as the database owner.
-- Fixes the live shared-catalogue read returning HTTP 403.
-- Only the backend service role gets access; customer roles stay blocked.
begin;
grant select on table public.lp_catalogue_cache to service_role;
revoke all on table public.lp_catalogue_cache from anon, authenticated;
commit;
