begin;
create table public.lp_referral_codes(
 user_id uuid primary key references auth.users(id) on delete cascade,
 code text unique not null check(code ~ '^[A-F0-9]{12}$'),
 created_at timestamptz not null default now()
);
create table public.lp_referrals(
 referred_user_id uuid primary key references auth.users(id) on delete cascade,
 referrer_user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 check(referred_user_id<>referrer_user_id)
);
alter table public.lp_referral_codes enable row level security;
alter table public.lp_referrals enable row level security;
revoke all on public.lp_referral_codes,public.lp_referrals from public,anon,authenticated;
grant all on public.lp_referral_codes,public.lp_referrals to service_role;
create index lp_referrals_referrer on public.lp_referrals(referrer_user_id);
create function public.lp_referral_on_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare referrer uuid; submitted text;
begin
 submitted:=upper(trim(coalesce(new.raw_user_meta_data->>'referral_code','')));
 if submitted ~ '^[A-F0-9]{12}$' then
  select user_id into referrer from public.lp_referral_codes where code=submitted;
  if referrer is not null and referrer<>new.id then
   insert into public.lp_referrals(referred_user_id,referrer_user_id) values(new.id,referrer) on conflict do nothing;
  end if;
 end if;
 return new;
exception when others then
 raise warning 'Referral attribution failed for a new account';
 return new;
end $$;
revoke all on function public.lp_referral_on_signup() from public,anon,authenticated;
create trigger lp_referral_after_signup after insert on auth.users for each row execute function public.lp_referral_on_signup();
create function public.lp_referral_summary(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare own_code text; verified_count bigint;
begin
 insert into public.lp_referral_codes(user_id,code)
 values(p_user,upper(encode(extensions.gen_random_bytes(6),'hex')))
 on conflict(user_id) do nothing;
 select code into own_code from public.lp_referral_codes where user_id=p_user;
 select count(*) into verified_count from public.lp_referrals r join auth.users u on u.id=r.referred_user_id where r.referrer_user_id=p_user and u.email_confirmed_at is not null and u.deleted_at is null;
 return jsonb_build_object('code',own_code,'verified_signups',verified_count);
end $$;
revoke all on function public.lp_referral_summary(uuid) from public,anon,authenticated;
grant execute on function public.lp_referral_summary(uuid) to service_role;
commit;
notify pgrst,'reload schema';
