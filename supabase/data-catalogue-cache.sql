-- Shared Pairgate catalogue cache and endpoint lock. Run once in Supabase SQL Editor.
begin;
create table if not exists public.lp_catalogue_cache (
  path text primary key, payload jsonb not null, saved_at timestamptz not null default now()
);
create table if not exists public.lp_catalogue_gate (
  id integer primary key check (id = 1), owner text,
  lease_until timestamptz not null default '-infinity',
  next_at timestamptz not null default '-infinity',
  cooldown_until timestamptz not null default '-infinity'
);
insert into public.lp_catalogue_gate(id) values(1) on conflict do nothing;
alter table public.lp_catalogue_cache enable row level security;
alter table public.lp_catalogue_gate enable row level security;
revoke all on public.lp_catalogue_cache, public.lp_catalogue_gate from anon, authenticated;
create or replace function public.lp_catalogue_control(
  p_action text, p_path text, p_owner text, p_payload jsonb default null,
  p_delay integer default 60
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.lp_catalogue_gate%rowtype;
  c public.lp_catalogue_cache%rowtype;
  t timestamptz := clock_timestamp();
begin
  select * into g from public.lp_catalogue_gate where id=1 for update;
  t := clock_timestamp();
  if p_action = 'claim' then
    select * into c from public.lp_catalogue_cache where path=p_path;
    if found and c.saved_at > t - interval '10 minutes' then
      return jsonb_build_object('state','cached','payload',c.payload);
    end if;
    if g.cooldown_until > t then
      return jsonb_build_object('state','cooldown','retryAfter',ceil(extract(epoch from g.cooldown_until-t)));
    end if;
    if g.lease_until > t or g.next_at > t then
      return jsonb_build_object('state','busy');
    end if;
    update public.lp_catalogue_gate set owner=p_owner,lease_until=t+interval '30 seconds' where id=1;
    return jsonb_build_object('state','acquired');
  elsif p_action in ('finish','cooldown') then
    if g.owner is distinct from p_owner or g.lease_until <= t then
      return jsonb_build_object('state','lost');
    end if;
    if p_action='finish' and p_payload is not null then
      insert into public.lp_catalogue_cache(path,payload,saved_at) values(p_path,p_payload,t)
      on conflict(path) do update set payload=excluded.payload,saved_at=excluded.saved_at;
    end if;
    update public.lp_catalogue_gate set owner=null,lease_until=t,
      next_at=t+interval '1500 milliseconds',
      cooldown_until=case when p_action='cooldown' then t+make_interval(secs=>greatest(1,least(p_delay,86400))) else cooldown_until end
      where id=1;
    return jsonb_build_object('state','released');
  end if;
  raise exception 'Invalid catalogue action';
end $$;
revoke all on function public.lp_catalogue_control(text,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.lp_catalogue_control(text,text,text,jsonb,integer) to service_role;
commit;
