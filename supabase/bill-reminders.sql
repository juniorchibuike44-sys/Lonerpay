begin;
create table public.lp_bill_reminders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 service text not null check (service in ('data','airtime','electricity','tv')),
 due_at timestamptz not null,
 state text not null default 'scheduled' check (state in ('scheduled','sent','cancelled')),
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
create index lp_bill_reminders_due on public.lp_bill_reminders(due_at) where state='scheduled';
create index lp_bill_reminders_owner on public.lp_bill_reminders(user_id,created_at desc);
alter table public.lp_bill_reminders enable row level security;
revoke all on public.lp_bill_reminders from public,anon,authenticated;
grant all on public.lp_bill_reminders to service_role;
alter table public.lp_notifications add column reminder_id uuid references public.lp_bill_reminders(id) on delete set null;
create unique index lp_notifications_reminder_once on public.lp_notifications(reminder_id) where reminder_id is not null;
create function public.lp_bill_reminders_dispatch() returns integer language plpgsql security invoker set search_path='' as $$
declare item record; notice uuid; total integer:=0;
begin
 for item in select * from public.lp_bill_reminders where state='scheduled' and due_at<=now() order by due_at for update skip locked limit 100 loop
  insert into public.lp_notifications(user_id,title,body,reminder_id)
  values(item.user_id,'Bill reminder','Your '||case item.service when 'tv' then 'TV' else initcap(item.service) end||' reminder is due. Open LonerPay to review and pay when you are ready.',item.id)
  on conflict (reminder_id) where reminder_id is not null do nothing returning id into notice;
  if notice is not null then
   insert into public.lp_push_jobs(notification_id,subscription_id,user_id)
   select notice,id,item.user_id from public.lp_push_subscriptions where user_id=item.user_id on conflict do nothing;
  end if;
  update public.lp_bill_reminders set state='sent',sent_at=now() where id=item.id;
  total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function public.lp_bill_reminders_dispatch() from public,anon,authenticated;
grant execute on function public.lp_bill_reminders_dispatch() to service_role;
commit;
notify pgrst,'reload schema';
