-- LonerPay: private inventory, opt-in WhatsApp catalogue and invoice reports.
-- Run AFTER business-tools.sql. This does not change wallet balances.
begin;
create table if not exists public.lp_business_products (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 120), sku text not null default '' check(char_length(sku)<=60),
 description text not null default '' check(char_length(description)<=600),
 price_kobo bigint not null check(price_kobo between 1 and 9999999999),
 quantity integer not null default 0 check(quantity between 0 and 1000000),
 low_stock integer not null default 5 check(low_stock between 0 and 1000000),
 published boolean not null default false, active boolean not null default true,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists lp_business_products_owner on public.lp_business_products(user_id,created_at desc,id);
create table if not exists public.lp_business_stock_moves (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid not null references public.lp_business_products(id), delta integer not null check(delta between -1000000 and 1000000 and delta<>0),
 reason text not null check(char_length(reason) between 1 and 200), balance integer not null,
 created_at timestamptz not null default now()
);
create index if not exists lp_business_stock_moves_owner on public.lp_business_stock_moves(user_id,created_at desc);
create table if not exists public.lp_business_stores (
 user_id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 120), whatsapp text not null check(whatsapp ~ '^[1-9][0-9]{7,14}$'),
 description text not null default '' check(char_length(description)<=600),
 published boolean not null default false, version integer not null default 1, updated_at timestamptz not null default now()
);
alter table public.lp_business_products enable row level security;
alter table public.lp_business_stock_moves enable row level security;
alter table public.lp_business_stores enable row level security;
revoke all on public.lp_business_products,public.lp_business_stock_moves,public.lp_business_stores from public,anon,authenticated;
grant all on public.lp_business_products,public.lp_business_stock_moves,public.lp_business_stores to service_role;

-- Create/edit uses an expected version; stock is only changed through the locked ledger.
create or replace function public.lp_business_product_save(p_owner uuid,p_id uuid,p_version integer,p_name text,p_sku text,p_description text,p_price bigint,p_low integer,p_published boolean,p_active boolean,p_opening integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.lp_business_products;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,1));
 select * into saved from public.lp_business_products where id=p_id for update;
 if found then
  if saved.user_id<>p_owner then raise exception 'Product not found'; end if;
  -- An identical retry after a lost response is safe, without another update.
  if saved.name=p_name and saved.sku=p_sku and saved.description=p_description and saved.price_kobo=p_price and saved.low_stock=p_low and saved.published=p_published and saved.active=p_active then return to_jsonb(saved); end if;
  if saved.version<>p_version then raise exception 'Product changed. Refresh before editing again'; end if;
  update public.lp_business_products set name=p_name,sku=p_sku,description=p_description,price_kobo=p_price,low_stock=p_low,published=p_published,active=p_active,version=version+1,updated_at=now() where id=p_id returning * into saved;
 else
  if p_version<>0 then raise exception 'Product not found'; end if;
  if (select count(*) from public.lp_business_products where user_id=p_owner)>=500 then raise exception 'Catalogue limit is 500 products'; end if;
  insert into public.lp_business_products(id,user_id,name,sku,description,price_kobo,quantity,low_stock,published,active) values(p_id,p_owner,p_name,p_sku,p_description,p_price,p_opening,p_low,p_published,p_active) returning * into saved;
  if p_opening>0 then insert into public.lp_business_stock_moves(id,user_id,product_id,delta,reason,balance) values(p_id,p_owner,p_id,p_opening,'Opening stock',p_opening); end if;
 end if;
 return to_jsonb(saved);
end $$;
create or replace function public.lp_business_stock_adjust(p_owner uuid,p_id uuid,p_move uuid,p_delta integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.lp_business_products; old public.lp_business_stock_moves; next_balance integer;
begin
 -- Serialize retries of the same movement, even when a different product is supplied.
 perform pg_advisory_xact_lock(hashtextextended(p_move::text,2));
 select * into saved from public.lp_business_products where id=p_id and user_id=p_owner for update;
 if not found then raise exception 'Product not found'; end if;
 select * into old from public.lp_business_stock_moves where id=p_move;
 if found then
  if old.user_id<>p_owner or old.product_id<>p_id or old.delta<>p_delta or old.reason<>p_reason then raise exception 'Stock reference already used'; end if;
  return to_jsonb(saved);
 end if;
 if not saved.active then raise exception 'Restore this product before adjusting stock'; end if;
 next_balance:=saved.quantity+p_delta;
 if p_delta=0 or next_balance<0 or next_balance>1000000 then raise exception 'Stock cannot be negative or exceed 1000000'; end if;
 insert into public.lp_business_stock_moves(id,user_id,product_id,delta,reason,balance) values(p_move,p_owner,p_id,p_delta,p_reason,next_balance);
 update public.lp_business_products set quantity=next_balance,version=version+1,updated_at=now() where id=p_id returning * into saved;
 return to_jsonb(saved);
end $$;
create or replace function public.lp_business_store_save(p_owner uuid,p_version integer,p_name text,p_whatsapp text,p_description text,p_published boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.lp_business_stores;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,3));
 select * into saved from public.lp_business_stores where user_id=p_owner for update;
 if found then
  if saved.name=p_name and saved.whatsapp=p_whatsapp and saved.description=p_description and saved.published=p_published then return to_jsonb(saved); end if;
  if saved.version<>p_version then raise exception 'Store changed. Refresh before editing again'; end if;
  update public.lp_business_stores set name=p_name,whatsapp=p_whatsapp,description=p_description,published=p_published,version=version+1,updated_at=now() where user_id=p_owner returning * into saved;
 else
  if p_version<>0 then raise exception 'Store not found'; end if;
  insert into public.lp_business_stores(user_id,name,whatsapp,description,published) values(p_owner,p_name,p_whatsapp,p_description,p_published) returning * into saved;
 end if;
 return to_jsonb(saved);
end $$;

create or replace function public.lp_business_report(p_owner uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; start_at timestamptz; end_at timestamptz;
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to 367 days'; end if;
 start_at:=p_from::timestamp at time zone 'Africa/Lagos'; end_at:=(p_to+1)::timestamp at time zone 'Africa/Lagos';
 select jsonb_build_object(
  'invoiced_kobo',coalesce(sum(total_kobo),0),'invoice_count',count(*),
  'cohort_paid_kobo',coalesce(sum(paid_kobo),0),'cohort_outstanding_kobo',coalesce(sum(total_kobo-paid_kobo),0)
 ) into result from public.lp_business_invoices where user_id=p_owner and status='issued' and issued_at>=start_at and issued_at<end_at;
 result:=result||jsonb_build_object('payments_kobo',(select coalesce(sum(p.amount_kobo),0) from public.lp_business_payments p join public.lp_business_invoices i on i.id=p.invoice_id where i.user_id=p_owner and p.created_at>=start_at and p.created_at<end_at));
 result:=result||jsonb_build_object('daily',(select coalesce(jsonb_agg(row_to_json(d) order by day),'[]'::jsonb) from (
 select days.day::date as day,
 coalesce((select sum(i.total_kobo) from public.lp_business_invoices i where i.user_id=p_owner and i.status='issued' and (i.issued_at at time zone 'Africa/Lagos')::date=days.day::date),0) as invoiced_kobo,
 coalesce((select sum(p.amount_kobo) from public.lp_business_payments p join public.lp_business_invoices i on i.id=p.invoice_id where i.user_id=p_owner and (p.created_at at time zone 'Africa/Lagos')::date=days.day::date),0) as payments_kobo
 from generate_series(p_from::timestamp,p_to::timestamp,'1 day'::interval) as days(day)) d));
 return result;
end $$;
revoke all on function public.lp_business_product_save(uuid,uuid,integer,text,text,text,bigint,integer,boolean,boolean,integer),public.lp_business_stock_adjust(uuid,uuid,uuid,integer,text),public.lp_business_store_save(uuid,integer,text,text,text,boolean),public.lp_business_report(uuid,date,date) from public,anon,authenticated;
grant execute on function public.lp_business_product_save(uuid,uuid,integer,text,text,text,bigint,integer,boolean,boolean,integer),public.lp_business_stock_adjust(uuid,uuid,uuid,integer,text),public.lp_business_store_save(uuid,integer,text,text,text,boolean),public.lp_business_report(uuid,date,date) to service_role;
commit;
notify pgrst,'reload schema';
