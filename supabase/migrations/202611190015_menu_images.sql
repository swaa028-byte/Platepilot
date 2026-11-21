-- Menu item photos.
--
-- A storefront with photographs sells; a wall of text does not. Images are
-- referenced by URL (the merchant's own CDN, or files shipped with the app)
-- rather than stored in the database.

alter table menu_items add column image_url text;
alter table menu_items add constraint menu_items_image_url_format
  check (image_url is null or image_url ~ '^(https?://|/)');

-- The published-menu RPC is the only reader of this table for the public
-- storefront; carry the new column through so visitors see the photos.
create or replace function app_published_menu(p_location_id uuid, p_locale text default 'en')
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_location locations%rowtype; v_items jsonb; v_price_book uuid; v_translations jsonb;
begin
  select * into v_location from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;

  select id into v_price_book from price_books
    where location_id = p_location_id and status = 'published'
    order by published_at desc limit 1;
  if v_price_book is null then
    return jsonb_build_object('location', jsonb_build_object(
      'id', v_location.id, 'slug', v_location.slug, 'name', v_location.name,
      'address', v_location.address, 'timezone', v_location.timezone,
      'currency', v_location.currency, 'serviceSettings', v_location.service_settings),
      'items', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(item order by item->>'name'), '[]'::jsonb) into v_items
  from (
    select jsonb_build_object(
      'id', mi.id,
      'name', mi.name,
      'description', mi.description,
      'allergens', to_jsonb(mi.allergens),
      'category', cc.name,
      'amountMinor', ip.amount_minor::text,
      'currency', pb.currency,
      'available', mi.available,
      'imageUrl', mi.image_url
    ) as item
    from menu_items mi
    join item_prices ip on ip.menu_item_id = mi.id
    join price_books pb on pb.id = ip.price_book_id and pb.id = v_price_book
    left join catalog_categories cc on cc.id = mi.category_id
    where mi.location_id = p_location_id
  ) sub;

  return jsonb_build_object('location', jsonb_build_object(
    'id', v_location.id, 'slug', v_location.slug, 'name', v_location.name,
    'address', v_location.address, 'timezone', v_location.timezone,
    'currency', v_location.currency, 'serviceSettings', v_location.service_settings),
    'items', v_items);
end $$;

revoke all on function app_published_menu(uuid, text) from public;
grant execute on function app_published_menu(uuid, text) to anon, authenticated;
