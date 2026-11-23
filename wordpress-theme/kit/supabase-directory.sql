-- PlatePilot · public restaurant directory
--
-- Run once in the Supabase SQL editor, after the schema migrations and after
-- kit/supabase-public-menu.sql. Safe to re-run.
--
-- The WordPress theme holds the project's anon key, server-side. Anonymous
-- visitors may read a published directory - the restaurants anyone can order
-- from, and nothing else. No orders, customers, staff, payments or unpublished
-- menus are reachable through this function: it returns a fixed jsonb shape of
-- nine public fields, built from the same published price book the storefront
-- reads, so the directory can never advertise a restaurant whose menu is gone.

create or replace function public.public_directory()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(entry order by entry->>'name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'slug',       l.slug,
      'name',       l.name,
      'address',    l.address,
      'currency',   l.currency,
      'ordering',   l.ordering_enabled,
      -- Opening hours are already public: the storefront prints them. Kept as
      -- the merchant wrote them so each surface can render them its own way.
      'hours',      coalesce(l.service_settings->'openingHours', 'null'::jsonb),
      'brand',      o.name,
      'items',      (
        select count(*)
        from item_prices ip
        join price_books pb on pb.id = ip.price_book_id
        where pb.location_id = l.id and pb.status = 'published'
      ),
      'leadImage',  (
        select mi.image_url
        from menu_items mi
        join item_prices ip on ip.menu_item_id = mi.id
        join price_books pb on pb.id = ip.price_book_id
        where pb.location_id = l.id and pb.status = 'published' and mi.image_url is not null
        order by mi.image_url
        limit 1
      ),
      'fromMinor',  (
        select min(ip.amount_minor)::text
        from item_prices ip
        join price_books pb on pb.id = ip.price_book_id
        where pb.location_id = l.id and pb.status = 'published'
      )
    ) as entry
    from locations l
    join organizations o on o.id = l.organization_id
    where l.slug is not null
      and exists (
        select 1 from price_books pb
        where pb.location_id = l.id and pb.status = 'published'
      )
  ) listed;
$$;

revoke all on function public.public_directory() from public;
grant execute on function public.public_directory() to anon;
grant execute on function public.public_directory() to authenticated;

-- Check after running:
--   select public.public_directory();
