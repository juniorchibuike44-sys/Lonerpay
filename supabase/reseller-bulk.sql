-- Server-mediated access only. Clients cannot approve accounts, set prices or claim orders.
create table public.lp_resellers (
 user_id uuid primary key references auth.users(id), business_name text not null check(length(business_name) between 2 and 120),
 contact text not null check(length(contact) between 5 and 160), status text not null default 'pending' check(status in ('pending','approved','suspended')),
 created_at timestamptz not null default now()
);
create table public.lp_reseller_offers (
 id uuid primary key default gen_random_uuid(), network text not null check(network in ('mtn','airtel','glo','9mobile')),
 plan_code text not null check(length(plan_code) between 1 and 150), plan_name text not null,
 provider_cost numeric(14,2) not null check(provider_cost>0), price numeric(14,2) not null,
 fee_reserve numeric(14,2) not null default 0 check(fee_reserve>=0), minimum_margin numeric(14,2) not null default 0 check(minimum_margin>=0),
 estimated_cashback_percent numeric not null default 0 check(estimated_cashback_percent in (0,2,3,5)),
 active boolean not null default false, updated_at timestamptz not null default now(),
 unique(network,plan_code), check(price>=provider_cost+fee_reserve+minimum_margin)
);
create table public.lp_bulk_batches (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), client_key uuid not null,
 offer_id uuid not null references public.lp_reseller_offers(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes', unique(user_id,client_key)
);
create table public.lp_bulk_items (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.lp_bulk_batches(id),
 recipient text not null check(recipient ~ '^0[0-9]{10}$'), price numeric(14,2) not null check(price>0),
 provider_cost numeric(14,2) not null check(provider_cost>0), fee_reserve numeric(14,2) not null,
 minimum_margin numeric(14,2) not null, network text not null, plan_code text not null,
 state text not null default 'queued' check(state in ('queued','started','not_charged')),
 request_id text not null unique, unique(batch_id,recipient)
);
create index on public.lp_bulk_batches(user_id,created_at desc);
create index on public.lp_bulk_items(batch_id);
alter table public.lp_resellers enable row level security;
alter table public.lp_reseller_offers enable row level security;
alter table public.lp_bulk_batches enable row level security;
alter table public.lp_bulk_items enable row level security;
revoke all on public.lp_resellers,public.lp_reseller_offers,public.lp_bulk_batches,public.lp_bulk_items from public,anon,authenticated;
grant select,insert,update on public.lp_resellers,public.lp_reseller_offers to service_role;
grant select on public.lp_bulk_batches,public.lp_bulk_items to service_role;

create function public.lp_bulk_create(p_user uuid,p_offer uuid,p_key uuid,p_recipients jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.lp_reseller_offers; b uuid; recipient text; item uuid;
begin
 if not exists(select 1 from public.lp_resellers where user_id=p_user and status='approved') then raise exception 'Reseller approval required'; end if;
 -- Serialize duplicate creation requests by the user-provided idempotency key.
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_key::text,0));
 select id into b from public.lp_bulk_batches where user_id=p_user and client_key=p_key;
 if b is not null then return b; end if;
 select * into o from public.lp_reseller_offers where id=p_offer and active for share;
 if o.id is null then raise exception 'Offer unavailable'; end if;
 if jsonb_typeof(p_recipients)<>'array' or jsonb_array_length(p_recipients) not between 2 and 20 then raise exception 'Use 2 to 20 recipients'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_recipients) t(v) where v !~ '^0[0-9]{10}$') then raise exception 'Invalid recipient'; end if;
 if (select count(distinct v) from jsonb_array_elements_text(p_recipients) t(v))<>jsonb_array_length(p_recipients) then raise exception 'Duplicate recipient'; end if;
 insert into public.lp_bulk_batches(user_id,client_key,offer_id) values(p_user,p_key,p_offer) returning id into b;
 for recipient in select jsonb_array_elements_text(p_recipients) loop
  item:=gen_random_uuid();
  insert into public.lp_bulk_items(id,batch_id,recipient,price,provider_cost,fee_reserve,minimum_margin,network,plan_code,request_id)
   values(item,b,recipient,o.price,o.provider_cost,o.fee_reserve,o.minimum_margin,o.network,o.plan_code,'bulk-'||item::text);
 end loop;
 return b;
end $$;

-- The item claim and wallet debit are one transaction. A started item is never
-- sent to the provider again, including after a timeout or browser reload.
create function public.lp_bulk_claim(p_user uuid,p_item uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.lp_bulk_items; b public.lp_bulk_batches; d record;
begin
 select * into i from public.lp_bulk_items where id=p_item for update;
 select * into b from public.lp_bulk_batches where id=i.batch_id;
 if b.user_id is distinct from p_user then raise exception 'Order unavailable'; end if;
 if i.state<>'queued' then return jsonb_build_object('claimed',false,'request_id',i.request_id,'state',i.state); end if;
 if b.expires_at<now() then raise exception 'Batch quote expired'; end if;
 if not exists(select 1 from public.lp_resellers where user_id=p_user and status='approved') then raise exception 'Reseller approval required'; end if;
 if not exists(select 1 from public.lp_reseller_offers where id=b.offer_id and active) then raise exception 'Offer unavailable'; end if;
 select * into d from public.debit_wallet(p_user,i.price,i.request_id,case when i.network='9mobile' then 'etisalat-data' else i.network||'-data' end,
  jsonb_build_object('provider','pairgate','bulk_item_id',i.id,'bulk_batch_id',b.id,'billersCode',i.recipient,'variation_code',i.plan_code));
 if not d.success then
  update public.lp_bulk_items set state='not_charged' where id=i.id;
  return jsonb_build_object('claimed',false,'state','not_charged','message',d.message,'request_id',i.request_id);
 end if;
 -- A pre-existing debit is never permission to repeat a provider purchase.
 if d.message='Request already processed' then
  update public.lp_bulk_items set state='started' where id=i.id;
  return jsonb_build_object('claimed',false,'state','started','request_id',i.request_id);
 end if;
 update public.lp_bulk_items set state='started' where id=i.id;
 return jsonb_build_object('claimed',true,'request_id',i.request_id,'success',true,'new_balance',d.new_balance,'transaction_id',d.transaction_id);
end $$;
revoke all on function public.lp_bulk_create(uuid,uuid,uuid,jsonb),public.lp_bulk_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lp_bulk_create(uuid,uuid,uuid,jsonb),public.lp_bulk_claim(uuid,uuid) to service_role;
notify pgrst,'reload schema';

-- Existing refund_wallet accepts successful debit rows only. Bulk purchases
-- also need to refund an explicitly failed provider order that was pending.
create function public.lp_bulk_refund(p_user_id uuid,p_request_id text,p_reason text default 'Provider payment failed') returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.wallet_transactions; r record;
begin
 select * into t from public.wallet_transactions where user_id=p_user_id and request_id=p_request_id and transaction_type='debit' for update;
 if t.id is null or not exists(select 1 from public.lp_bulk_items i join public.lp_bulk_batches b on b.id=i.batch_id where i.request_id=p_request_id and b.user_id=p_user_id) then raise exception 'Bulk transaction unavailable'; end if;
 if t.status='successful' and coalesce(t.details->>'provider_status','') in ('successful','success','completed','paid','approved') then raise exception 'Delivered purchase cannot be refunded'; end if;
 if t.status='pending' then update public.wallet_transactions set status='successful' where id=t.id; end if;
 select * into r from public.refund_wallet(p_user_id,p_request_id,p_reason);
 return to_jsonb(r);
end $$;
revoke all on function public.lp_bulk_refund(uuid,text,text) from public,anon,authenticated;
grant execute on function public.lp_bulk_refund(uuid,text,text) to service_role;
notify pgrst,'reload schema';
