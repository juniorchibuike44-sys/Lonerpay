-- Account PIN persists until an explicit reset. Device approval still expires.
begin;
create table if not exists public.login_pin_accounts(
 user_id uuid primary key references auth.users(id) on delete cascade,
 pin_proof text check(pin_proof ~ '^[a-f0-9]{64}$'),
 failed_attempts integer not null default 0,locked_until timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.login_pin_accounts enable row level security;
revoke all on public.login_pin_accounts from public,anon,authenticated;
grant all on public.login_pin_accounts to service_role;

create or replace function public.login_pin_account_context(p_user uuid,p_id uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid; ready boolean; account_proof text;
begin
 owner_id:=p_user;
 if owner_id is null then select user_id into owner_id from login_pin_devices where id=p_id and device_hash=p_hash and expires_at>now();end if;
 if owner_id is null then return '{}'::jsonb;end if;
 select pin_proof into account_proof from login_pin_accounts where user_id=owner_id;
 select exists(select 1 from login_pin_devices where id=p_id and device_hash=p_hash and user_id=owner_id and expires_at>now()) into ready;
 return jsonb_build_object('user_id',owner_id,'has_pin',account_proof is not null or exists(select 1 from login_pin_devices where user_id=owner_id),'device_ready',ready,'legacy_ids',coalesce((select jsonb_agg(id) from login_pin_devices where user_id=owner_id),'[]'::jsonb));
end $$;

create or replace function public.configure_account_login_pin(p_user uuid,p_proof text,p_mode text,p_id uuid,p_hash text,p_device_proof text,p_legacy jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.login_pin_accounts; valid boolean; attempts integer;
begin
 if p_user is null or p_proof is null or p_proof !~ '^[a-f0-9]{64}$' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_device_proof is null or p_device_proof !~ '^[a-f0-9]{64}$' or p_id is null or p_mode is null or p_mode not in ('enroll','attach','reset') then raise exception 'Invalid account PIN request';end if;
 insert into login_pin_accounts(user_id) values(p_user) on conflict do nothing;
 select * into a from login_pin_accounts where user_id=p_user for update;
 if p_mode='enroll' and (a.pin_proof is not null or exists(select 1 from login_pin_devices where user_id=p_user)) then return jsonb_build_object('status','already_set');end if;
 if p_mode='attach' then
  if a.locked_until>now() then return jsonb_build_object('status','locked');end if;
  valid:=coalesce(a.pin_proof=p_proof,false);
  if a.pin_proof is null then
   select exists(select 1 from login_pin_devices d join jsonb_array_elements(p_legacy) x on x->>'id'=d.id::text and x->>'proof'=d.pin_proof where d.user_id=p_user) into valid;
  end if;
  if not valid then
   attempts:=a.failed_attempts+1;
   update login_pin_accounts set failed_attempts=case when attempts>=5 then 0 else attempts end,locked_until=case when attempts>=5 then now()+interval '15 minutes' else null end where user_id=p_user;
   return jsonb_build_object('status',case when attempts>=5 then 'locked' else 'incorrect' end);
  end if;
 end if;
 if p_mode='reset' then delete from login_pin_devices where user_id=p_user;end if;
 update login_pin_accounts set pin_proof=coalesce(case when p_mode='reset' then p_proof else a.pin_proof end,p_proof),failed_attempts=0,locked_until=null,updated_at=now() where user_id=p_user;
 insert into login_pin_devices(id,user_id,device_hash,pin_proof,expires_at) values(p_id,p_user,p_hash,p_device_proof,now()+interval '30 days');
 return jsonb_build_object('status','ok');
end $$;

create or replace function public.check_account_login_pin(p_id uuid,p_hash text,p_account_proof text,p_legacy_proof text,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.login_pin_devices;a public.login_pin_accounts;attempts integer;
begin
 select * into d from login_pin_devices where id=p_id and device_hash=p_hash;
 if not found or d.expires_at<=now() then return jsonb_build_object('status','expired');end if;
 insert into login_pin_accounts(user_id) values(d.user_id) on conflict do nothing;
 select * into a from login_pin_accounts where user_id=d.user_id for update;
 select * into d from login_pin_devices where id=p_id and device_hash=p_hash for update;
 if not found or d.expires_at<=now() then return jsonb_build_object('status','expired');end if;
 if a.locked_until>now() or d.locked_until>now() then return jsonb_build_object('status','locked','retry_after',900);end if;
 if d.lease_id is not null and d.lease_expires_at>now() then return jsonb_build_object('status','busy');end if;
 if p_account_proof is null or p_account_proof !~ '^[a-f0-9]{64}$' or (a.pin_proof is not null and a.pin_proof<>p_account_proof) or (a.pin_proof is null and (p_legacy_proof is null or d.pin_proof<>p_legacy_proof)) then
  attempts:=a.failed_attempts+1;
  update login_pin_accounts set failed_attempts=case when attempts>=5 then 0 else attempts end,locked_until=case when attempts>=5 then now()+interval '15 minutes' else null end where user_id=d.user_id;
  return jsonb_build_object('status',case when attempts>=5 then 'locked' else 'incorrect' end);
 end if;
 update login_pin_accounts set pin_proof=coalesce(pin_proof,p_account_proof),failed_attempts=0,locked_until=null,updated_at=now() where user_id=d.user_id;
 update login_pin_devices set failed_attempts=0,locked_until=null,lease_id=p_lease,lease_expires_at=now()+interval '60 seconds',last_used_at=now(),expires_at=now()+interval '30 days',updated_at=now() where id=p_id;
 return jsonb_build_object('status','ok','user_id',d.user_id);
end $$;

create or replace function public.forget_login_pin_device(p_id uuid,p_hash text)
returns void language sql security definer set search_path=public,pg_temp as $$
 update login_pin_devices set expires_at=now(),lease_id=null,lease_expires_at=null where id=p_id and device_hash=p_hash;
$$;
revoke all on function public.login_pin_account_context(uuid,uuid,text),public.configure_account_login_pin(uuid,text,text,uuid,text,text,jsonb),public.check_account_login_pin(uuid,text,text,text,uuid),public.forget_login_pin_device(uuid,text) from public,anon,authenticated;
grant execute on function public.login_pin_account_context(uuid,uuid,text),public.configure_account_login_pin(uuid,text,text,uuid,text,text,jsonb),public.check_account_login_pin(uuid,text,text,text,uuid),public.forget_login_pin_device(uuid,text) to service_role;
commit;
notify pgrst,'reload schema';
select 'account-login-pin-v1' as installed;
