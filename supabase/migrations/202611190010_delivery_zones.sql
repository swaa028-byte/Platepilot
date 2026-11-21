-- Delivery zones.
--
-- Until now a location had one flat delivery fee and a flat postal allow-list
-- in service_settings. Real restaurants charge different fees to different
-- areas and refuse short orders far away. A location can now define named
-- zones matched by postal-code prefix (longest prefix wins, so "8001" wins
-- over "8" for postal code 80012), each with its own fee and minimum order.
-- Locations with no zones keep exactly the old flat behaviour.

create table delivery_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  postal_prefixes text[] not null default '{}' check (cardinality(postal_prefixes) between 1 and 100),
  fee_minor bigint not null default 0 check (fee_minor >= 0),
  min_order_minor bigint not null default 0 check (min_order_minor >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict,
  unique (location_id, name)
);

alter table orders add column delivery_zone_id uuid references delivery_zones(id) on delete set null;

-- Manager-facing zone management ------------------------------------------------

create or replace function app_list_delivery_zones(p_actor uuid, p_location_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', z.id, 'name', z.name, 'postalPrefixes', z.postal_prefixes,
    'feeMinor', z.fee_minor::text, 'minOrderMinor', z.min_order_minor::text,
    'active', z.active, 'createdAt', z.created_at) order by z.name), '[]'::jsonb)
  from delivery_zones z
  where z.location_id = p_location_id and is_organization_member(z.organization_id);
$$;

create or replace function app_upsert_delivery_zone(
  p_actor uuid, p_location_id uuid, p_zone_id uuid,
  p_name text, p_postal_prefixes text[], p_fee_minor bigint, p_min_order_minor bigint, p_active boolean
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid; v_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  if p_fee_minor < 0 or p_min_order_minor < 0 then raise exception 'INVALID_REQUEST'; end if;
  if p_postal_prefixes is null or cardinality(p_postal_prefixes) = 0 then raise exception 'INVALID_POSTAL_PREFIXES'; end if;
  if exists (select 1 from unnest(p_postal_prefixes) as prefix
             where btrim(prefix) = '' or char_length(btrim(prefix)) > 12
                or btrim(prefix) !~ '^[A-Za-z0-9][A-Za-z0-9 -]*$') then
    raise exception 'INVALID_POSTAL_PREFIXES';
  end if;
  if p_zone_id is null then
    insert into delivery_zones(organization_id, location_id, name, postal_prefixes, fee_minor, min_order_minor, active)
    values (v_organization_id, p_location_id, btrim(p_name), p_postal_prefixes, p_fee_minor, p_min_order_minor, coalesce(p_active, true))
    returning id into v_id;
  else
    update delivery_zones z
    set name = btrim(p_name), postal_prefixes = p_postal_prefixes, fee_minor = p_fee_minor,
        min_order_minor = p_min_order_minor, active = coalesce(p_active, z.active)
    where z.id = p_zone_id and z.location_id = p_location_id
    returning z.id into v_id;
    if not found then raise exception 'ZONE_NOT_FOUND'; end if;
  end if;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_organization_id, p_actor, 'delivery_zone.saved', 'delivery_zone', v_id::text,
    jsonb_build_object('name', btrim(p_name), 'prefixes', to_jsonb(p_postal_prefixes)));
  return v_id;
end $$;

create or replace function app_delete_delivery_zone(p_actor uuid, p_zone_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from delivery_zones where id = p_zone_id;
  if not found then raise exception 'ZONE_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  delete from delivery_zones where id = p_zone_id;
end $$;

-- Fee resolution. The storefront quotes through the server; the customer never
-- decides what delivery costs.
create or replace function app_resolve_delivery_zone(p_location_id uuid, p_postal_code text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_postal text; v_zone delivery_zones%rowtype;
begin
  v_postal := upper(regexp_replace(coalesce(p_postal_code, ''), '[^A-Za-z0-9]', '', 'g'));
  select z.* into v_zone
  from delivery_zones z, unnest(z.postal_prefixes) as u(prefix)
  where z.location_id = p_location_id and z.active
    and starts_with(v_postal, upper(regexp_replace(u.prefix, '[^A-Za-z0-9]', '', 'g')))
  order by char_length(upper(regexp_replace(u.prefix, '[^A-Za-z0-9]', '', 'g'))) desc, z.name
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object('zoneId', v_zone.id, 'name', v_zone.name,
    'feeMinor', v_zone.fee_minor::text, 'minOrderMinor', v_zone.min_order_minor::text);
end $$;

revoke all on function app_list_delivery_zones(uuid,uuid) from public;
revoke all on function app_upsert_delivery_zone(uuid,uuid,uuid,text,text[],bigint,bigint,boolean) from public;
revoke all on function app_delete_delivery_zone(uuid,uuid) from public;
revoke all on function app_resolve_delivery_zone(uuid,text) from public, authenticated;
grant execute on function app_list_delivery_zones(uuid,uuid) to authenticated;
grant execute on function app_upsert_delivery_zone(uuid,uuid,uuid,text,text[],bigint,bigint,boolean) to authenticated;
grant execute on function app_delete_delivery_zone(uuid,uuid) to authenticated;
grant execute on function app_resolve_delivery_zone(uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- Order creation learns about zones. Same signature; a location without zones
-- behaves exactly as before.
-- ---------------------------------------------------------------------------
create or replace function app_create_order(
  p_location_id uuid,
  p_service_type text,
  p_customer_locale text,
  p_items jsonb,
  p_scheduled_for timestamptz default null,
  p_discount_code text default null,
  p_tip_minor bigint default null,
  p_delivery_address text default null,
  p_delivery_postal_code text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_currency text; v_timezone text; v_settings jsonb;
  v_order_id uuid; v_tracking text;
  v_priced jsonb; v_lines jsonb; v_line jsonb;
  v_subtotal bigint; v_discount bigint; v_tax bigint; v_total bigint;
  v_service_fee bigint := 0; v_delivery_fee bigint := 0; v_tip bigint := 0;
  v_tax_basis_points integer; v_tax_inclusive boolean;
  v_discount_info jsonb;
  v_postal text; v_zone delivery_zones%rowtype; v_zone_min_order bigint := null;
begin
  if p_service_type !~ '^(pickup|delivery|dine_in|catering)$' then raise exception 'INVALID_REQUEST'; end if;
  if p_customer_locale !~ '^(en|fr|es|pt|ar)$' then raise exception 'INVALID_REQUEST'; end if;

  select organization_id, currency, timezone, service_settings
    into v_organization_id, v_currency, v_timezone, v_settings
    from locations where id = p_location_id and ordering_enabled = true;
  if not found then raise exception 'ORDERING_NOT_ENABLED'; end if;

  -- Service hours. A scheduled order is accepted when its delivery time falls
  -- inside an open window; an immediate order is accepted only while open.
  if p_scheduled_for is null then
    if not app_is_open_at(v_settings, v_timezone, now()) then raise exception 'LOCATION_CLOSED'; end if;
  else
    if not app_is_open_at(v_settings, v_timezone, p_scheduled_for) then raise exception 'SCHEDULE_OUTSIDE_OPENING_HOURS'; end if;
  end if;

  -- Delivery service area. A zone matched by postal-code prefix sets the fee
  -- and the minimum order; without a zone match the location's flat fee and
  -- postal allow-list apply, exactly as before zones existed.
  if p_service_type = 'delivery' then
    if p_delivery_address is null or btrim(p_delivery_address) = '' then raise exception 'DELIVERY_ADDRESS_REQUIRED'; end if;
    v_postal := upper(regexp_replace(coalesce(p_delivery_postal_code, ''), '[^A-Za-z0-9]', '', 'g'));
    select z.* into v_zone
    from delivery_zones z, unnest(z.postal_prefixes) as u(prefix)
    where z.location_id = p_location_id and z.active
      and starts_with(v_postal, upper(regexp_replace(u.prefix, '[^A-Za-z0-9]', '', 'g')))
    order by char_length(upper(regexp_replace(u.prefix, '[^A-Za-z0-9]', '', 'g'))) desc, z.name
    limit 1;
    if found then
      v_delivery_fee := v_zone.fee_minor;
      v_zone_min_order := v_zone.min_order_minor;
    else
      if jsonb_typeof(v_settings->'serviceArea'->'postalCodes') = 'array'
         and jsonb_array_length(v_settings->'serviceArea'->'postalCodes') > 0 then
        if p_delivery_postal_code is null
           or not exists (
             select 1 from jsonb_array_elements_text(v_settings->'serviceArea'->'postalCodes') as code
             where lower(code) = lower(btrim(p_delivery_postal_code))
           ) then
          raise exception 'OUTSIDE_SERVICE_AREA';
        end if;
      end if;
      v_delivery_fee := coalesce((v_settings->>'deliveryFeeMinor')::bigint, 0);
    end if;
  end if;

  v_priced := app_price_order_lines(p_location_id, v_organization_id, v_currency, p_items);
  v_lines := v_priced->'lines';
  v_subtotal := (v_priced->>'subtotalMinor')::bigint;

  if v_zone_min_order is not null and v_subtotal < v_zone_min_order then
    raise exception 'DELIVERY_MIN_ORDER';
  end if;

  v_discount_info := app_resolve_discount(p_location_id, v_organization_id, p_discount_code, v_subtotal);
  v_discount := (v_discount_info->>'discountMinor')::bigint;

  v_tax_basis_points := coalesce((v_settings->>'taxBasisPoints')::integer, 0);
  if v_tax_basis_points < 0 or v_tax_basis_points > 10000 then raise exception 'INVALID_TAX_RATE'; end if;
  v_tax_inclusive := coalesce(v_settings->>'pricingMode' = 'tax_inclusive', false);

  v_service_fee := coalesce((v_settings->>'serviceFeeMinor')::bigint, 0);
  if p_tip_minor is not null then
    if p_tip_minor < 0 then raise exception 'INVALID_REQUEST'; end if;
    v_tip := p_tip_minor;
  end if;

  -- Tax-exclusive pricing adds tax to the discounted subtotal. Tax-inclusive
  -- pricing means the listed prices already contain the tax, so the tax is
  -- extracted from the discounted subtotal instead of added to it.
  if v_tax_inclusive then
    v_tax := (v_subtotal - v_discount) - ((v_subtotal - v_discount) * 10000 / (10000 + v_tax_basis_points));
  else
    v_tax := ((v_subtotal - v_discount) * v_tax_basis_points + 5000) / 10000;
  end if;

  v_total := v_subtotal - v_discount + v_tax + v_service_fee + v_delivery_fee + v_tip;
  if v_total < 0 then raise exception 'INVALID_REQUEST'; end if;

  v_tracking := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into orders(
    organization_id, location_id, tracking_token, service_type, customer_locale, currency,
    subtotal_minor, discount_minor, tax_minor, tip_minor, total_minor,
    delivery_fee_minor, tax_basis_points, discount_code, scheduled_for,
    delivery_address, delivery_postal_code, source_channel, delivery_zone_id
  ) values (
    v_organization_id, p_location_id, v_tracking, p_service_type, p_customer_locale, v_currency,
    v_subtotal, v_discount, v_tax, v_tip, v_total,
    v_delivery_fee, v_tax_basis_points, v_discount_info->>'code', p_scheduled_for,
    p_delivery_address, p_delivery_postal_code, 'storefront', v_zone.id
  ) returning id into v_order_id;

  for v_line in select value from jsonb_array_elements(v_lines) loop
    insert into order_items(
      order_id, menu_item_id, name_snapshot, description_snapshot, selections_snapshot,
      quantity, unit_price_minor, line_total_minor, currency
    ) values (
      v_order_id, (v_line->>'menuItemId')::uuid, v_line->>'name', coalesce(v_line->>'description', ''),
      coalesce(v_line->'selections', '[]'::jsonb),
      (v_line->>'quantity')::integer, (v_line->>'unitPriceMinor')::bigint,
      ((v_line->>'unitPriceMinor')::bigint * (v_line->>'quantity')::integer), v_currency
    );
  end loop;

  if v_discount_info->>'promotionId' is not null then
    update promotions set redeemed_count = redeemed_count + 1
      where id = (v_discount_info->>'promotionId')::uuid;
  end if;

  insert into audit_events(organization_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, 'order.created', 'order', v_order_id::text,
      jsonb_build_object('channel', 'storefront', 'serviceType', p_service_type));

  return jsonb_build_object(
    'orderId', v_order_id, 'trackingToken', v_tracking,
    'currency', v_currency,
    'subtotalMinor', v_subtotal::text, 'discountMinor', v_discount::text,
    'taxMinor', v_tax::text, 'serviceFeeMinor', v_service_fee::text,
    'deliveryFeeMinor', v_delivery_fee::text, 'tipMinor', v_tip::text,
    'deliveryZoneId', v_zone.id, 'totalMinor', v_total::text, 'paymentStatus', 'unpaid');
end $$;
