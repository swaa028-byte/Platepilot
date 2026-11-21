begin;

-- ---------------------------------------------------------------------------
-- Several menus per location, by service period.
--
-- A restaurant serves breakfast from 06:00, lunch from 11:30 and dinner from
-- 17:00, and the prices and dishes differ. Until now one published price book
-- served every hour. A price book gains a label and an optional schedule:
-- which weekdays it runs and between which local times. A book without a
-- schedule is always available. At any moment the storefront shows the
-- scheduled book that matches now, falling back to the unscheduled one.
-- ---------------------------------------------------------------------------

alter table price_books add column if not exists label text;
alter table price_books add column if not exists schedule jsonb;
alter table price_books add constraint price_books_schedule_shape
  check (schedule is null or (
    jsonb_typeof(schedule) = 'object'
    and schedule->>'start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and schedule->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and jsonb_typeof(schedule->'days') = 'array'
  ));

-- Publishes an additional, scheduled menu without touching the other books.
create or replace function app_publish_service_menu(
  p_organization_id uuid, p_location_id uuid, p_label text, p_schedule jsonb, p_items jsonb, p_actor uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_currency text; v_price_book_id uuid; v_category_id uuid; v_menu_item_id uuid; v_item jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_actor or not exists(select 1 from memberships where organization_id=p_organization_id and user_id=p_actor and role in ('owner','manager')) then raise exception 'FORBIDDEN'; end if;
  select currency into v_currency from locations where id=p_location_id and organization_id=p_organization_id for update;
  if not found or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 500 then raise exception 'INVALID_REQUEST'; end if;
  if p_label is null or btrim(p_label) = '' or char_length(btrim(p_label)) > 60 then raise exception 'INVALID_REQUEST'; end if;
  if p_schedule is not null then
    if p_schedule->>'start' is null or p_schedule->>'end' is null or p_schedule->'days' is null
      or (p_schedule->>'start') >= (p_schedule->>'end') then raise exception 'INVALID_REQUEST'; end if;
    if exists (
      select 1 from jsonb_array_elements_text(p_schedule->'days') d
      where d !~ '^[0-6]$'
    ) or (select count(*) from jsonb_array_elements_text(p_schedule->'days') d)
      <> (select count(distinct d) from jsonb_array_elements_text(p_schedule->'days') d) then
      raise exception 'INVALID_REQUEST';
    end if;
  end if;

  insert into price_books(organization_id, location_id, currency, status, label, schedule, published_by, published_at)
    values (p_organization_id, p_location_id, v_currency, 'published', btrim(p_label), p_schedule, p_actor, now())
    returning id into v_price_book_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if v_item->>'currency' <> v_currency or (v_item->>'amountMinor') !~ '^[0-9]+$' then raise exception 'CURRENCY_OR_AMOUNT_MISMATCH'; end if;
    insert into catalog_categories(organization_id, location_id, name) values (p_organization_id, p_location_id, v_item->>'category')
      on conflict (location_id, name) do update set name=excluded.name returning id into v_category_id;
    insert into menu_items(organization_id, location_id, category_id, name, description, allergens, available)
      values (p_organization_id, p_location_id, v_category_id, v_item->>'item', coalesce(v_item->>'description',''), coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(v_item->'allergens','[]'::jsonb))), '{}'), coalesce((v_item->>'available')::boolean,false))
      on conflict (category_id, name) do update set description=excluded.description, allergens=excluded.allergens, available=excluded.available, version=menu_items.version+1 returning id into v_menu_item_id;
    insert into item_prices(price_book_id, menu_item_id, amount_minor) values (v_price_book_id, v_menu_item_id, (v_item->>'amountMinor')::bigint);
  end loop;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (p_organization_id, p_actor, 'menu.published', 'price_book', v_price_book_id::text,
      jsonb_build_object('label', btrim(p_label), 'scheduled', p_schedule is not null));
  return v_price_book_id;
end $$;

-- What the merchant has published, including schedules.
create or replace function app_list_price_books(p_actor uuid, p_location_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'priceBookId', pb.id, 'label', pb.label, 'schedule', pb.schedule, 'status', pb.status,
    'publishedAt', pb.published_at,
    'items', (select count(*) from item_prices ip where ip.price_book_id = pb.id)
  ) order by pb.published_at desc nulls last), '[]'::jsonb)
  from price_books pb
  where pb.location_id = p_location_id and is_organization_member(pb.organization_id);
$$;

-- Archives one book. The always-available book can be archived too; the
-- storefront then honestly reports that nothing is published.
create or replace function app_archive_price_book(p_actor uuid, p_price_book_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from price_books where id = p_price_book_id for update;
  if not found then raise exception 'PRICE_BOOK_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  update price_books set status = 'archived' where id = p_price_book_id;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id)
    values (v_organization_id, p_actor, 'menu.archived', 'price_book', p_price_book_id::text);
end $$;

-- The public menu now picks the book that is serving at this moment.
create or replace function app_published_menu(p_location_id uuid, p_locale text default 'en', p_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_location locations%rowtype; v_items jsonb; v_price_book uuid;
begin
  select * into v_location from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;

  -- A scheduled book matches when the local weekday is listed and the local
  -- time of p_at falls inside its window. Scheduled books win over the
  -- always-available one; among equals the newest publication wins.
  select pb.id into v_price_book
  from price_books pb
  where pb.location_id = p_location_id and pb.status = 'published'
    and (
      pb.schedule is null
      or (
        (extract(dow from (coalesce(p_at, now()) at time zone v_location.timezone))::int)::text
          = any(select jsonb_array_elements_text(pb.schedule->'days'))
        and to_char((coalesce(p_at, now()) at time zone v_location.timezone), 'HH24:MI') >= (pb.schedule->>'start')
        and to_char((coalesce(p_at, now()) at time zone v_location.timezone), 'HH24:MI') < (pb.schedule->>'end')
      )
    )
  order by (pb.schedule is not null) desc, pb.published_at desc
  limit 1;

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

revoke all on function app_published_menu(uuid, text, timestamptz) from public;
grant execute on function app_published_menu(uuid, text, timestamptz) to anon, authenticated;

revoke all on function app_publish_service_menu(uuid,uuid,text,jsonb,jsonb,uuid) from public;
revoke all on function app_list_price_books(uuid,uuid) from public;
revoke all on function app_archive_price_book(uuid,uuid) from public;
grant execute on function app_publish_service_menu(uuid,uuid,text,jsonb,jsonb,uuid) to authenticated;
grant execute on function app_list_price_books(uuid,uuid) to authenticated;
grant execute on function app_archive_price_book(uuid,uuid) to authenticated;

commit;
