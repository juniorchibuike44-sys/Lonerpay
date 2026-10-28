begin;
create table if not exists public.lp_security_rate_limits (
  bucket text primary key,
  hits integer not null,
  expires_at timestamptz not null
);
alter table public.lp_security_rate_limits enable row level security;
revoke all on public.lp_security_rate_limits from public, anon, authenticated;
grant all on public.lp_security_rate_limits to service_role;
create or replace function public.lp_check_rate_limit(p_bucket text, p_limit integer, p_window_ms integer)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_hits integer; v_expiry timestamptz; v_now timestamptz := clock_timestamp();
begin
  if p_bucket !~ '^[a-f0-9]{64}$' or p_limit < 1 or p_limit > 1000 or p_window_ms < 1000 or p_window_ms > 3600000 then
    raise exception 'Invalid rate limit parameters';
  end if;
  insert into public.lp_security_rate_limits as b(bucket,hits,expires_at)
  values(p_bucket,1,v_now + p_window_ms * interval '1 millisecond')
  on conflict(bucket) do update set
    hits = case when b.expires_at <= v_now then 1 else b.hits + 1 end,
    expires_at = case when b.expires_at <= v_now then v_now + p_window_ms * interval '1 millisecond' else b.expires_at end
  returning hits,expires_at into v_hits,v_expiry;
  if random() < 0.001 then
    delete from public.lp_security_rate_limits where expires_at < v_now - interval '1 hour';
  end if;
  return jsonb_build_object('allowed',v_hits <= p_limit,'remaining',greatest(0,p_limit-v_hits),'retry_after',greatest(1,ceil(extract(epoch from (v_expiry-v_now)))::integer));
end $$;
revoke all on function public.lp_check_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.lp_check_rate_limit(text,integer,integer) to service_role;
commit;