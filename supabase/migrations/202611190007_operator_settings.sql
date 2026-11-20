begin;

-- ---------------------------------------------------------------------------
-- Operator settings surface.
--
-- Up to this migration PlatePilot's locations were configurable only by hand:
-- `ordering_enabled` and `service_settings` existed in the schema, and the
-- storefront and order functions already read them, but nothing in the product
-- could write them. A merchant therefore could not switch online ordering on,
-- set opening hours, a delivery fee or a minimum order, and every reservation
-- was refused because `restaurant_tables` was never populated.
--
-- These functions are the missing operator layer. They do not invent a second
-- configuration store: they read and write the same columns the ordering and
-- reservation functions already use, so what a manager saves here is exactly
-- what the storefront and the kitchen act on.
-- ---------------------------------------------------------------------------

-- The manager's view of a location, including the settings the storefront uses.
create or replace function app_location_settings(p_location_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_location locations;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select * into v_location from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  -- Any member reads the hours and toggles they work from; only a manager writes them.
  if not is_organization_member(v_location.organization_id) then raise exception 'FORBIDDEN'; end if;

  return jsonb_build_object(
    'locationId', v_location.id,
    'organizationId', v_location.organization_id,
    'name', v_location.name,
    'address', v_location.address,
    'timezone', v_location.timezone,
    'currency', v_location.currency,
    'orderingEnabled', v_location.ordering_enabled,
    'serviceSettings', v_location.service_settings,
    'tableCount', (select count(*) from restaurant_tables where location_id = p_location_id),
    'seatCount', (select coalesce(sum(capacity), 0) from restaurant_tables where location_id = p_location_id)
  );
end $$;

-- Saves the ordering settings a merchant actually operates with.
--
-- Every value is validated here rather than in the browser: a malformed opening
-- window or a non-numeric fee would otherwise reach `app_create_order` and
-- surface as a refused order instead of a refused settings save.
create or replace function app_update_location_settings(
  p_location_id uuid, p_actor uuid, p_ordering_enabled boolean, p_service_settings jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid;
  v_settings jsonb := coalesce(p_service_settings, '{}'::jsonb);
  v_hours jsonb;
  v_day text;
  v_window jsonb;
  v_start text;
  v_end text;
  v_postal jsonb;
  v_fee text;
  v_minimum text;
  v_tax integer;
  v_prep integer;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(v_settings) <> 'object' then raise exception 'INVALID_SETTINGS'; end if;

  -- Opening hours: weekday number -> array of ["HH:MM", "HH:MM"] windows.
  if v_settings ? 'openingHours' then
    v_hours := v_settings -> 'openingHours';
    if v_hours is null or jsonb_typeof(v_hours) <> 'object' then raise exception 'INVALID_OPENING_HOURS'; end if;
    for v_day in select jsonb_object_keys(v_hours) loop
      if v_day !~ '^[0-6]$' then raise exception 'INVALID_OPENING_HOURS'; end if;
      if jsonb_typeof(v_hours -> v_day) <> 'array' then raise exception 'INVALID_OPENING_HOURS'; end if;
      for v_window in select value from jsonb_array_elements(v_hours -> v_day) loop
        if jsonb_typeof(v_window) <> 'array' or jsonb_array_length(v_window) <> 2 then raise exception 'INVALID_OPENING_HOURS'; end if;
        v_start := v_window ->> 0;
        v_end := v_window ->> 1;
        if v_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
          raise exception 'INVALID_OPENING_HOURS';
        end if;
        if v_start = v_end then raise exception 'INVALID_OPENING_HOURS'; end if;
      end loop;
    end loop;
  end if;

  -- Delivery area: an optional list of postal codes. An empty or missing list
  -- means the location serves its whole delivery zone.
  if v_settings ? 'serviceArea' then
    if jsonb_typeof(v_settings -> 'serviceArea') <> 'object' then raise exception 'INVALID_SERVICE_AREA'; end if;
    v_postal := v_settings -> 'serviceArea' -> 'postalCodes';
    if v_postal is not null and v_postal <> 'null'::jsonb then
      if jsonb_typeof(v_postal) <> 'array' then raise exception 'INVALID_SERVICE_AREA'; end if;
      if exists (select 1 from jsonb_array_elements(v_postal) as code
                  where jsonb_typeof(code) <> 'string' or length(btrim(code #>> '{}')) not between 1 and 20) then
        raise exception 'INVALID_SERVICE_AREA';
      end if;
    end if;
  end if;

  -- Money is stored as integer minor units in a string, the same contract the
  -- ordering functions read.
  if v_settings ? 'deliveryFeeMinor' then
    v_fee := v_settings ->> 'deliveryFeeMinor';
    if v_fee !~ '^[0-9]+$' then raise exception 'INVALID_SETTINGS'; end if;
  end if;
  if v_settings ? 'minimumOrderMinor' then
    v_minimum := v_settings ->> 'minimumOrderMinor';
    if v_minimum !~ '^[0-9]+$' then raise exception 'INVALID_SETTINGS'; end if;
  end if;
  if v_settings ? 'taxBasisPoints' then
    if jsonb_typeof(v_settings -> 'taxBasisPoints') <> 'number' then raise exception 'INVALID_SETTINGS'; end if;
    v_tax := (v_settings ->> 'taxBasisPoints')::integer;
    if v_tax < 0 or v_tax > 10000 then raise exception 'INVALID_SETTINGS'; end if;
  end if;
  if v_settings ? 'prepMinutes' then
    if jsonb_typeof(v_settings -> 'prepMinutes') <> 'number' then raise exception 'INVALID_SETTINGS'; end if;
    v_prep := (v_settings ->> 'prepMinutes')::integer;
    if v_prep < 0 or v_prep > 240 then raise exception 'INVALID_SETTINGS'; end if;
  end if;

  update locations
     set ordering_enabled = coalesce(p_ordering_enabled, ordering_enabled),
         service_settings = v_settings
   where id = p_location_id;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, p_actor, 'location_settings_updated', 'location', p_location_id::text,
            jsonb_build_object('orderingEnabled', p_ordering_enabled, 'keys', (select jsonb_agg(k) from jsonb_object_keys(v_settings) k)));

  return app_location_settings(p_location_id, p_actor);
end $$;

-- ---------------------------------------------------------------------------
-- Tables.
--
-- A table is what a reservation is booked against and what the floor planner
-- draws. The plan lives in `floor_plans.document`; bookings live in
-- `restaurant_tables`. Keeping both in step is what `app_sync_tables_from_floor`
-- is for, so a host can draw the room once and take bookings from it.
-- ---------------------------------------------------------------------------

create or replace function app_list_tables(p_location_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_member(v_organization_id) then raise exception 'FORBIDDEN'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'tableId', t.id, 'name', t.name, 'capacity', t.capacity,
             'state', t.state, 'operationalUse', t.operational_use) order by t.name)
      from restaurant_tables t where t.location_id = p_location_id), '[]'::jsonb);
end $$;

create or replace function app_upsert_table(
  p_location_id uuid, p_actor uuid, p_table_id uuid, p_name text, p_capacity integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid; v_id uuid; v_existing text;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  if p_name is null or btrim(p_name) = '' or length(p_name) > 60 then raise exception 'INVALID_REQUEST'; end if;
  if p_capacity is null or p_capacity < 1 or p_capacity > 100 then raise exception 'INVALID_REQUEST'; end if;

  select id into v_id from restaurant_tables
   where location_id = p_location_id and btrim(name) = btrim(p_name) and (p_table_id is null or id <> p_table_id);
  if v_id is not null then raise exception 'TABLE_NAME_TAKEN'; end if;

  if p_table_id is null then
    insert into restaurant_tables(organization_id, location_id, name, capacity, operational_use)
      values (v_organization_id, p_location_id, btrim(p_name), p_capacity, true)
      returning id into v_id;
  else
    select name into v_existing from restaurant_tables where id = p_table_id and location_id = p_location_id;
    if not found then raise exception 'TABLE_NOT_FOUND'; end if;
    -- A booked table keeps its bookings; renaming or resizing it is allowed, and
    -- the capacity check on the next booking uses the new value.
    update restaurant_tables set name = btrim(p_name), capacity = p_capacity where id = p_table_id;
  end if;

  return jsonb_build_object('tableId', v_id);
end $$;

create or replace function app_delete_table(p_location_id uuid, p_actor uuid, p_table_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from reservations where table_id = p_table_id and status in ('booked','seated') and starts_at > now()) then
    raise exception 'TABLE_HAS_BOOKINGS';
  end if;
  delete from restaurant_tables where id = p_table_id and location_id = p_location_id;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  return jsonb_build_object('deleted', p_table_id);
end $$;

-- Takes the drawn room and makes it bookable. Tables are matched by name, so
-- re-running after moving a table on the plan does not create duplicates, and a
-- table removed from the plan is removed from the booking book only when it has
-- no future bookings.
create or replace function app_sync_tables_from_floor(p_location_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid;
  v_document jsonb;
  v_table jsonb;
  v_name text;
  v_capacity integer;
  v_kept text[] := '{}';
  v_created integer := 0;
  v_updated integer := 0;
  v_removed integer := 0;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;

  select document into v_document from floor_plans where location_id = p_location_id and organization_id = v_organization_id;
  if not found then raise exception 'FLOOR_PLAN_NOT_FOUND'; end if;
  if jsonb_typeof(v_document -> 'tables') <> 'array' then raise exception 'FLOOR_PLAN_EMPTY'; end if;

  for v_table in select value from jsonb_array_elements(v_document -> 'tables') loop
    v_name := btrim(coalesce(v_table ->> 'name', ''));
    if v_name = '' then continue; end if;
    v_capacity := coalesce((v_table ->> 'capacity')::integer, 1);
    if v_capacity < 1 then v_capacity := 1; end if;
    if v_capacity > 100 then v_capacity := 100; end if;
    v_kept := array_append(v_kept, v_name);

    insert into restaurant_tables(organization_id, location_id, name, capacity, operational_use)
      values (v_organization_id, p_location_id, v_name, v_capacity, true)
      on conflict (location_id, name) do update set capacity = excluded.capacity;
    if found then
      if exists (select 1 from restaurant_tables where location_id = p_location_id and name = v_name and capacity = v_capacity) then
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  delete from restaurant_tables t
   where t.location_id = p_location_id
     and not (t.name = any(v_kept))
     and not exists (select 1 from reservations r where r.table_id = t.id and r.status in ('booked','seated') and r.starts_at > now());
  get diagnostics v_removed = row_count;

  select count(*) into v_created from restaurant_tables where location_id = p_location_id and name = any(v_kept);
  return jsonb_build_object('tables', coalesce(v_created, 0), 'removed', v_removed, 'planVersion',
    (select version from floor_plans where location_id = p_location_id));
end $$;

-- The drawn room, for the planner to reopen.
create or replace function app_floor_plan(p_location_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid; v_plan floor_plans;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_member(v_organization_id) then raise exception 'FORBIDDEN'; end if;

  select * into v_plan from floor_plans where location_id = p_location_id and organization_id = v_organization_id;
  if not found then
    return jsonb_build_object('version', 0, 'document', null);
  end if;
  return jsonb_build_object(
    'version', v_plan.version,
    'status', v_plan.status,
    'document', v_plan.document,
    'updatedAt', v_plan.updated_at
  );
end $$;

-- ---------------------------------------------------------------------------
-- Customer book.
--
-- Derived from the orders a location actually took, not a separate copy of the
-- same data. Contact details are deliberately not returned: the column that
-- would hold them is encrypted at rest and PlatePilot has no key management,
-- so exposing them here would be a promise the product cannot keep.
-- ---------------------------------------------------------------------------

create or replace function app_customer_book(p_location_id uuid, p_actor uuid, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid; v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_member(v_organization_id) then raise exception 'FORBIDDEN'; end if;

  return coalesce((
    select jsonb_agg(row_to_json(book)) from (
      select o.customer_name as "name",
             count(*) as "orders",
             sum(o.total_minor)::text as "spendMinor",
             max(o.created_at) as "lastOrderAt",
             min(o.created_at) as "firstOrderAt"
        from orders o
       where o.location_id = p_location_id
         and o.fulfillment_status <> 'cancelled'
         and o.customer_name is not null
         and btrim(o.customer_name) <> ''
       group by o.customer_name
       order by sum(o.total_minor) desc
       limit v_limit) book), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Receipt.
--
-- One settled order as a document a merchant can print or a tax authority can
-- read: line items, the discount, the tax rate that was applied and the exact
-- tax amount, the fee and tip, and how it was tendered.
-- ---------------------------------------------------------------------------

create or replace function app_order_receipt(p_order_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid; v_order orders; v_location locations; v_tax_bps integer := 0;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select * into v_order from orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  v_organization_id := v_order.organization_id;
  if not is_organization_member(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  select * into v_location from locations where id = v_order.location_id;
  v_tax_bps := coalesce((v_location.service_settings ->> 'taxBasisPoints')::integer, 0);

  return jsonb_build_object(
    'orderId', v_order.id,
    'issuedAt', now(),
    'locationName', v_location.name,
    'locationAddress', v_location.address,
    'currency', v_order.currency,
    'serviceType', v_order.service_type,
    'customerName', v_order.customer_name,
    'placedAt', v_order.created_at,
    'paymentStatus', v_order.payment_status,
    'fulfillmentStatus', v_order.fulfillment_status,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', i.name_snapshot, 'quantity', i.quantity,
               'unitPriceMinor', i.unit_price_minor::text,
               'lineTotalMinor', i.line_total_minor::text) order by i.name_snapshot)
        from order_items i where i.order_id = v_order.id), '[]'::jsonb),
    'subtotalMinor', v_order.subtotal_minor::text,
    'discountMinor', v_order.discount_minor::text,
    'taxBasisPoints', v_tax_bps,
    'taxMinor', v_order.tax_minor::text,
    'tipMinor', v_order.tip_minor::text,
    'totalMinor', v_order.total_minor::text,
    'tenders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'provider', p.provider, 'status', p.status,
               'amountMinor', p.amount_minor::text) order by p.created_at)
        from payment_attempts p where p.order_id = v_order.id), '[]'::jsonb)
  );
end $$;

revoke all on function app_location_settings(uuid, uuid) from public;
revoke all on function app_update_location_settings(uuid, uuid, boolean, jsonb) from public;
revoke all on function app_list_tables(uuid, uuid) from public;
revoke all on function app_upsert_table(uuid, uuid, uuid, text, integer) from public;
revoke all on function app_delete_table(uuid, uuid, uuid) from public;
revoke all on function app_sync_tables_from_floor(uuid, uuid) from public;
revoke all on function app_floor_plan(uuid, uuid) from public;
revoke all on function app_customer_book(uuid, uuid, integer) from public;
revoke all on function app_order_receipt(uuid, uuid) from public;

grant execute on function app_location_settings(uuid, uuid) to authenticated;
grant execute on function app_update_location_settings(uuid, uuid, boolean, jsonb) to authenticated;
grant execute on function app_list_tables(uuid, uuid) to authenticated;
grant execute on function app_upsert_table(uuid, uuid, uuid, text, integer) to authenticated;
grant execute on function app_delete_table(uuid, uuid, uuid) to authenticated;
grant execute on function app_sync_tables_from_floor(uuid, uuid) to authenticated;
grant execute on function app_floor_plan(uuid, uuid) to authenticated;
grant execute on function app_customer_book(uuid, uuid, integer) to authenticated;
grant execute on function app_order_receipt(uuid, uuid) to authenticated;

commit;
