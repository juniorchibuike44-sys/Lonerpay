-- Run once in the Supabase SQL editor. Safe to run again.
begin;
create table if not exists public.lp_announcements (
 id uuid primary key default gen_random_uuid(), request_key uuid unique not null,
 title text not null check(char_length(title) between 1 and 120), body text not null check(char_length(body) between 1 and 2000),
 audience text not null, emails text[] not null default '{}', send_email boolean not null default false,
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.lp_notifications (
 id uuid primary key default gen_random_uuid(), announcement_id uuid not null references public.lp_announcements(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, title text not null, body text not null,
 created_at timestamptz not null default now(), read_at timestamptz, unique(announcement_id,user_id)
);
create index if not exists lp_notifications_user_date on public.lp_notifications(user_id,created_at desc);
create table if not exists public.lp_notification_email_jobs (
 id uuid primary key default gen_random_uuid(), announcement_id uuid not null references public.lp_announcements(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, email text not null,
 state text not null default 'queued' check(state in ('queued','processing','accepted','failed','unknown')),
 claim_token uuid, lease_until timestamptz, updated_at timestamptz not null default now(), unique(announcement_id,user_id)
);
alter table public.lp_announcements enable row level security;
alter table public.lp_notifications enable row level security;
alter table public.lp_notification_email_jobs enable row level security;
revoke all on public.lp_announcements,public.lp_notifications,public.lp_notification_email_jobs from anon,authenticated;
grant all on public.lp_announcements,public.lp_notifications,public.lp_notification_email_jobs to service_role;
create or replace function public.lp_notification_prepare(p_owner uuid,p_request_key uuid,p_title text,p_body text,p_audience text,p_emails text[],p_email boolean,p_commit boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ids uuid[]; eligible integer; missing text[]; campaign public.lp_announcements; normalized text[];
begin
 if not exists(select 1 from auth.users where id=p_owner and lower(email)='juniorchibuike44@gmail.com') then raise exception 'Owner access only'; end if;
 if p_audience not in ('all','selected') or char_length(trim(p_title)) not between 1 and 120 or char_length(trim(p_body)) not between 1 and 2000 then raise exception 'Invalid announcement'; end if;
 select coalesce(array_agg(distinct lower(trim(e)) order by lower(trim(e))),'{}') into normalized from unnest(p_emails) e where trim(e)<>'';
 if cardinality(normalized)>100 or (p_audience='selected' and cardinality(normalized)=0) then raise exception 'Select between 1 and 100 customers'; end if;
 select coalesce(array_agg(id),'{}'),count(*) filter(where email_confirmed_at is not null and email is not null) into ids,eligible from auth.users where p_audience='all' or lower(email)=any(normalized);
 select coalesce(array_agg(e),'{}') into missing from unnest(normalized) e where not exists(select 1 from auth.users u where lower(u.email)=e);
 if not p_commit then return jsonb_build_object('recipient_count',cardinality(ids),'email_count',case when p_email then eligible else 0 end,'missing_emails',missing); end if;
 -- Serialize retries with the same request key, including simultaneous requests.
 perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
 select * into campaign from public.lp_announcements where request_key=p_request_key;
 if found then
  if campaign.title<>p_title or campaign.body<>p_body or campaign.audience<>p_audience or campaign.emails<>normalized or campaign.send_email<>p_email then raise exception 'Request key already used for another message'; end if;
  return jsonb_build_object('id',campaign.id);
 end if;
 if cardinality(ids)=0 or cardinality(missing)>0 then raise exception 'No recipients or unknown customer emails'; end if;
 insert into public.lp_announcements(request_key,title,body,audience,emails,send_email,created_by) values(p_request_key,p_title,p_body,p_audience,normalized,p_email,p_owner) returning * into campaign;
 insert into public.lp_notifications(announcement_id,user_id,title,body) select campaign.id,unnest(ids),p_title,p_body;
 if p_email then insert into public.lp_notification_email_jobs(announcement_id,user_id,email) select campaign.id,id,email from auth.users where id=any(ids) and email_confirmed_at is not null and email is not null; end if;
 return jsonb_build_object('id',campaign.id,'recipient_count',cardinality(ids),'email_count',case when p_email then eligible else 0 end);
end $$;
create or replace function public.lp_notification_claim(p_campaign uuid,p_claim uuid)
returns setof public.lp_notification_email_jobs language plpgsql security definer set search_path=public as $$
begin
 update public.lp_notification_email_jobs set state='unknown',updated_at=now() where announcement_id=p_campaign and state='processing' and lease_until<now();
 return query update public.lp_notification_email_jobs j set state='processing',claim_token=p_claim,lease_until=now()+interval '2 minutes',updated_at=now()
 where j.id in(select q.id from public.lp_notification_email_jobs q where q.announcement_id=p_campaign and q.state='queued' order by q.id for update skip locked limit 1) returning j.*;
end $$;
create or replace function public.lp_notification_campaigns()
returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
 select a.id,a.title,a.created_at,
 (select count(*) from public.lp_notifications n where n.announcement_id=a.id) recipients,
 (select count(*) from public.lp_notifications n where n.announcement_id=a.id and n.read_at is not null) opened,
 (select coalesce(jsonb_object_agg(state,c),'{}'::jsonb) from(select state,count(*) c from public.lp_notification_email_jobs j where j.announcement_id=a.id group by state)s) email
 from public.lp_announcements a order by a.created_at desc limit 20)x;
$$;
revoke all on function public.lp_notification_prepare(uuid,uuid,text,text,text,text[],boolean,boolean),public.lp_notification_claim(uuid,uuid),public.lp_notification_campaigns() from public,anon,authenticated;
grant execute on function public.lp_notification_prepare(uuid,uuid,text,text,text,text[],boolean,boolean),public.lp_notification_claim(uuid,uuid),public.lp_notification_campaigns() to service_role;
commit;
notify pgrst,'reload schema';
