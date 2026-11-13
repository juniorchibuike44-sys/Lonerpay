-- Extend the existing trigger; do not recreate jobs or replay historical credits.
begin;
create or replace function public.lp_funding_notice() returns trigger language plpgsql security invoker set search_path='' as $$
declare notice_id uuid; message text;
begin
 if new.transaction_type<>'credit' or new.status<>'successful' or new.service not in ('paystack_wallet_funding','monnify_wallet_funding') or new.amount<=0 then return new; end if;
 message := '₦'||to_char(new.amount,'FM999,999,999,999,990.00')||' has been added to your LonerPay wallet.';
 insert into public.lp_notifications(user_id,title,body,funding_transaction_id)
 values(new.user_id,'Wallet funded',message,new.id)
 on conflict (funding_transaction_id) where funding_transaction_id is not null do nothing returning id into notice_id;
 if notice_id is not null then
  insert into public.lp_push_jobs(notification_id,subscription_id,user_id)
  select notice_id,id,new.user_id from public.lp_push_subscriptions where user_id=new.user_id;
 end if;
 return new;
end $$;
revoke all on function public.lp_funding_notice() from public,anon,authenticated;
commit;
