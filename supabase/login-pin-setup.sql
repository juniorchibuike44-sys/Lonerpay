-- LonerPay six-digit login PIN database setup
-- Run once in the Supabase SQL editor for the production project.

begin;

create table if not exists public.login_pin_devices (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[a-f0-9]{64}$'),
  pin_proof text not null check (pin_proof ~ '^[a-f0-9]{64}$'),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  lease_id uuid,
  lease_expires_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_hash)
);

alter table public.login_pin_devices enable row level security;

revoke all on public.login_pin_devices from anon, authenticated;
grant all on public.login_pin_devices to service_role;

create or replace function public.enroll_login_pin(
  p_id uuid,
  p_user_id uuid,
  p_device_hash text,
  p_pin_proof text,
  p_previous_id uuid default null,
  p_previous_hash text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null
     or p_device_hash !~ '^[a-f0-9]{64}$'
     or p_pin_proof !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid login PIN enrollment';
  end if;

  if p_previous_id is not null and p_previous_hash is not null then
    delete from public.login_pin_devices
    where id = p_previous_id
      and device_hash = p_previous_hash
      and user_id = p_user_id;
  end if;

  delete from public.login_pin_devices
  where user_id = p_user_id
    and device_hash = p_device_hash;

  insert into public.login_pin_devices (
    id, user_id, device_hash, pin_proof, expires_at
  ) values (
    p_id, p_user_id, p_device_hash, p_pin_proof, now() + interval '30 days'
  );
end;
$$;

create or replace function public.check_login_pin(
  p_id uuid,
  p_device_hash text,
  p_pin_proof text,
  p_lease_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data public.login_pin_devices%rowtype;
  attempts integer;
  retry_seconds integer;
begin
  select *
  into row_data
  from public.login_pin_devices
  where id = p_id and device_hash = p_device_hash
  for update;

  if not found or row_data.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  if row_data.locked_until is not null and row_data.locked_until > now() then
    retry_seconds := greatest(1, ceil(extract(epoch from row_data.locked_until - now()))::integer);
    return jsonb_build_object('status', 'locked', 'retry_after', retry_seconds);
  end if;

  if row_data.lease_id is not null
     and row_data.lease_expires_at is not null
     and row_data.lease_expires_at > now() then
    return jsonb_build_object('status', 'busy');
  end if;

  if row_data.pin_proof <> p_pin_proof then
    attempts := row_data.failed_attempts + 1;

    update public.login_pin_devices
    set failed_attempts = case when attempts >= 5 then 0 else attempts end,
        locked_until = case when attempts >= 5 then now() + interval '15 minutes' else null end,
        lease_id = null,
        lease_expires_at = null,
        updated_at = now()
    where id = p_id;

    if attempts >= 5 then
      return jsonb_build_object('status', 'locked', 'retry_after', 900);
    end if;

    return jsonb_build_object('status', 'incorrect');
  end if;

  update public.login_pin_devices
  set failed_attempts = 0,
      locked_until = null,
      lease_id = p_lease_id,
      lease_expires_at = now() + interval '60 seconds',
      last_used_at = now(),
      expires_at = now() + interval '30 days',
      updated_at = now()
  where id = p_id;

  return jsonb_build_object('status', 'ok', 'user_id', row_data.user_id);
end;
$$;

create or replace function public.finish_login_pin(
  p_id uuid,
  p_lease_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.login_pin_devices
  set lease_id = null,
      lease_expires_at = null,
      updated_at = now()
  where id = p_id and lease_id = p_lease_id;
$$;

revoke all on function public.enroll_login_pin(uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.check_login_pin(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.finish_login_pin(uuid, uuid) from public, anon, authenticated;

grant execute on function public.enroll_login_pin(uuid, uuid, text, text, uuid, text) to service_role;
grant execute on function public.check_login_pin(uuid, text, text, uuid) to service_role;
grant execute on function public.finish_login_pin(uuid, uuid) to service_role;

commit;
