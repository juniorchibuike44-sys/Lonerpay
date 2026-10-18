-- Run after business-growth.sql. Product images stay in a private bucket.
begin;
alter table public.lp_business_products add column if not exists image_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('business-products','business-products',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create or replace function public.lp_business_product_photo(p_owner uuid,p_id uuid,p_version integer,p_path text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.lp_business_products;
begin
 select * into saved from public.lp_business_products where id=p_id and user_id=p_owner for update;
 if not found then raise exception 'Product not found'; end if;
 if p_path is not null and (length(p_path)>160 or p_path !~ ('^'||p_owner::text||'/'||p_id::text||'/[a-f0-9-]{36}\.jpg$')) then raise exception 'Invalid product photo'; end if;
 if saved.image_path is not distinct from p_path then return to_jsonb(saved); end if;
 if saved.version<>p_version then raise exception 'Product changed. Refresh before changing its photo'; end if;
 update public.lp_business_products set image_path=p_path,version=version+1,updated_at=now() where id=p_id returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.lp_business_product_photo(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.lp_business_product_photo(uuid,uuid,integer,text) to service_role;
commit;
notify pgrst,'reload schema';
