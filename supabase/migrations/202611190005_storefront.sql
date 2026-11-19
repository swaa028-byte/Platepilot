begin;

-- ---------------------------------------------------------------------------
-- Storefront addressing and public menu.
--
-- A restaurant needs a stable, readable address for search engines and for
-- AI systems that read structured data. The slug is generated server-side and
-- is unique across the platform.
-- ---------------------------------------------------------------------------

alter table locations add column if not exists slug text;
create unique index if not exists locations_slug_key on locations(slug) where slug is not null;

-- ---------------------------------------------------------------------------
-- Merchant creation, now producing a storefront slug.
-- ---------------------------------------------------------------------------
create or replace function app_create_merchant(
  p_name text, p_address text, p_legal_country text, p_currency text,
  p_timezone text, p_locale text, p_place_id text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_location_id uuid; v_slug text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_currency !~ '^[A-Z]{3}$' or p_locale !~ '^(en|fr|es|pt|ar)$' then raise exception 'INVALID_REQUEST'; end if;

  insert into organizations(name, legal_country, default_locale) values (p_name, p_legal_country, p_locale) returning id into v_organization_id;

  -- A readable slug with a short suffix taken from the identifier, so two
  -- restaurants with the same name still get different addresses.
  v_slug := trim(both '-' from lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g')));
  if v_slug = '' then v_slug := 'restaurant'; end if;
  v_slug := left(v_slug, 60) || '-' || substr(replace(v_organization_id::text, '-', ''), 1, 6);

  insert into locations(organization_id, name, address, timezone, currency, slug)
    values (v_organization_id, p_name, p_address, p_timezone, p_currency, v_slug)
    returning id into v_location_id;

  insert into memberships(organization_id, user_id, role) values (v_organization_id, auth.uid(), 'owner');
  if p_place_id is not null then
    insert into external_listings(organization_id, location_id, external_id, linked_by) values (v_organization_id, v_location_id, p_place_id, auth.uid());
  end if;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id) values (v_organization_id, auth.uid(), 'merchant.created', 'organization', v_organization_id::text);
  return jsonb_build_object('organizationId', v_organization_id, 'locationId', v_location_id, 'slug', v_slug);
end $$;

-- ---------------------------------------------------------------------------
-- Public storefront data.
--
-- Returns only what a customer may already see: the merchant's own name and
-- address, its declared opening hours, and the published, available menu with
-- its prices. It never returns staff, customer, payment or financial data.
-- ---------------------------------------------------------------------------
create or replace function app_published_menu(p_location_id uuid, p_locale text default 'en')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
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
      'available', mi.available
    ) as item
    from menu_items mi
    join item_prices ip on ip.menu_item_id = mi.id
    join price_books pb on pb.id = ip.price_book_id
    join catalog_categories cc on cc.id = mi.category_id
    where ip.price_book_id = v_price_book
      and mi.available = true
      and mi.location_id = p_location_id
  ) rows;

  select coalesce(jsonb_object_agg(mt.locale, jsonb_build_object(
    'name', mt.name,
    'description', mt.description,
    'legalText', mt.legal_text,
    'publicationStatus', mt.publication_status
  )), '{}'::jsonb) into v_translations
  from menu_translations mt
  where mt.menu_item_id in (select menu_item_id from item_prices where price_book_id = v_price_book)
    and mt.publication_status = 'published';

  return jsonb_build_object(
    'location', jsonb_build_object(
      'id', v_location.id,
      'slug', v_location.slug,
      'name', v_location.name,
      'address', v_location.address,
      'timezone', v_location.timezone,
      'currency', v_location.currency,
      'serviceSettings', v_location.service_settings,
      'orderingEnabled', v_location.ordering_enabled),
    'items', v_items,
    'translations', v_translations);
end $$;

revoke all on function app_create_merchant(text,text,text,text,text,text,text) from public;
revoke all on function app_published_menu(uuid, text) from public;
grant execute on function app_create_merchant(text,text,text,text,text,text,text) to authenticated;
grant execute on function app_published_menu(uuid, text) to service_role;

commit;
