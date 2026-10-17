-- LonerPay Business Tools: invoices and a merchant's private credit sales ledger.
-- Manual ledger entries do not move money or confirm a bank payment.
begin;
create table if not exists public.lp_business_invoices (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 business_name text not null, customer_name text not null, customer_contact text not null default '',
 items jsonb not null, total_kobo bigint not null check(total_kobo>0), paid_kobo bigint not null default 0 check(paid_kobo>=0 and paid_kobo<=total_kobo),
 due_date date, note text not null default '', status text not null check(status in ('draft','issued')),
 created_at timestamptz not null default now(), issued_at timestamptz
);
create index if not exists lp_business_invoices_owner on public.lp_business_invoices(user_id,created_at desc);
create table if not exists public.lp_business_payments (
 id uuid primary key, invoice_id uuid not null references public.lp_business_invoices(id) on delete cascade,
 amount_kobo bigint not null check(amount_kobo>0), note text not null default '',created_at timestamptz not null default now()
);
alter table public.lp_business_invoices enable row level security;
alter table public.lp_business_payments enable row level security;
revoke all on public.lp_business_invoices,public.lp_business_payments from anon,authenticated;
grant all on public.lp_business_invoices,public.lp_business_payments to service_role;
create or replace function public.lp_business_create(p_owner uuid,p_invoice uuid,p_business text,p_customer text,p_contact text,p_items jsonb,p_due date,p_note text,p_draft boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare total bigint:=0; item jsonb; saved public.lp_business_invoices;
begin
 if char_length(trim(p_business)) not between 1 and 120 or char_length(trim(p_customer)) not between 1 and 120 or char_length(p_contact)>160 or char_length(p_note)>1000 or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Invalid invoice'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if char_length(trim(item->>'description')) not between 1 and 200 or (item->>'quantity')!~'^[1-9][0-9]{0,3}$' or (item->>'unit_kobo')!~'^[1-9][0-9]{0,9}$' then raise exception 'Invalid invoice item'; end if;
  total:=total+(item->>'quantity')::bigint*(item->>'unit_kobo')::bigint;
 end loop;
 if total>100000000000 then raise exception 'Invoice exceeds allowed total'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_invoice::text,0));
 select * into saved from public.lp_business_invoices where id=p_invoice;
 if found then
  if saved.user_id<>p_owner or saved.business_name<>p_business or saved.customer_name<>p_customer or saved.customer_contact<>p_contact or saved.items<>p_items or saved.due_date is distinct from p_due or saved.note<>p_note then raise exception 'Invoice reference already used'; end if;
  return to_jsonb(saved);
 end if;
 insert into public.lp_business_invoices(id,user_id,business_name,customer_name,customer_contact,items,total_kobo,due_date,note,status,issued_at)
 values(p_invoice,p_owner,p_business,p_customer,p_contact,p_items,total,p_due,p_note,case when p_draft then 'draft' else 'issued' end,case when p_draft then null else now() end) returning * into saved;
 return to_jsonb(saved);
end $$;
create or replace function public.lp_business_payment(p_owner uuid,p_invoice uuid,p_payment uuid,p_amount bigint,p_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare inv public.lp_business_invoices; old public.lp_business_payments;
begin
 select * into inv from public.lp_business_invoices where id=p_invoice and user_id=p_owner for update;
 if not found then raise exception 'Invoice not found'; end if;
 select * into old from public.lp_business_payments where id=p_payment;
 if found then
  if old.invoice_id<>p_invoice or old.amount_kobo<>p_amount or old.note<>p_note then raise exception 'Payment reference already used'; end if;
  return to_jsonb(inv);
 end if;
 if inv.status<>'issued' or p_amount<=0 or p_amount>inv.total_kobo-inv.paid_kobo or char_length(p_note)>500 then raise exception 'Check the repayment amount and invoice status'; end if;
 insert into public.lp_business_payments(id,invoice_id,amount_kobo,note) values(p_payment,p_invoice,p_amount,p_note);
 update public.lp_business_invoices set paid_kobo=paid_kobo+p_amount where id=p_invoice returning * into inv;
 return to_jsonb(inv);
end $$;
create or replace function public.lp_business_summary(p_owner uuid)
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('outstanding_kobo',coalesce(sum(total_kobo-paid_kobo) filter(where status='issued'),0),'overdue_count',count(*) filter(where status='issued' and paid_kobo<total_kobo and due_date<current_date),'invoice_count',count(*)) from public.lp_business_invoices where user_id=p_owner;
$$;
revoke all on function public.lp_business_create(uuid,uuid,text,text,text,jsonb,date,text,boolean),public.lp_business_payment(uuid,uuid,uuid,bigint,text),public.lp_business_summary(uuid) from public,anon,authenticated;
grant execute on function public.lp_business_create(uuid,uuid,text,text,text,jsonb,date,text,boolean),public.lp_business_payment(uuid,uuid,uuid,bigint,text),public.lp_business_summary(uuid) to service_role;
commit;
notify pgrst,'reload schema';
