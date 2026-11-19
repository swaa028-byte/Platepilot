begin;

-- ---------------------------------------------------------------------------
-- Operations schema.
--
-- Extends the core tables with the records a real shift needs: option groups
-- and modifiers on menu items, promotions, delivery detail on orders, and the
-- tender record used to reconcile a cash shift. No sample or demo rows are
-- inserted; a fresh database stays empty.
-- ---------------------------------------------------------------------------

alter table orders add column if not exists delivery_address text;
alter table orders add column if not exists delivery_postal_code text;
alter table orders add column if not exists delivery_fee_minor bigint not null default 0;
alter table orders add column if not exists tax_basis_points integer not null default 0;
alter table orders add column if not exists discount_code text;
alter table orders add column if not exists source_channel text not null default 'storefront';
alter table orders add column if not exists tender_type text check (tender_type in ('cash','counter','external_terminal','online'));
alter table orders add column if not exists payment_provider text;

alter table kitchen_tickets add column if not exists notes text;
alter table kitchen_tickets add column if not exists ready_at timestamptz;
alter table kitchen_tickets add column if not exists served_at timestamptz;

create table modifier_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  menu_item_id uuid not null references menu_items(id) on delete restrict,
  name text not null,
  selection_type text not null default 'single' check (selection_type in ('single','multiple')),
  min_selections integer not null default 0 check (min_selections >= 0),
  max_selections integer not null default 1 check (max_selections >= 0),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict
);
create table modifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  modifier_group_id uuid not null references modifier_groups(id) on delete restrict,
  name text not null,
  price_delta_minor bigint not null default 0,
  available boolean not null default true,
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict
);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  code text not null,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_basis_points integer not null default 0 check (discount_basis_points between 0 and 10000),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  max_discount_minor bigint,
  min_subtotal_minor bigint not null default 0 check (min_subtotal_minor >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer,
  redeemed_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict,
  unique (location_id, code)
);
create index promotions_location_code on promotions(location_id, code);

-- ---------------------------------------------------------------------------
-- Opening hours helper.
--
-- `openingHours` maps a weekday number (0 = Sunday, matching JavaScript's
-- Date#getDay) to an array of ["HH:MM", "HH:MM"] windows. A window whose end
-- is not after its start crosses midnight. A location without `openingHours`
-- is treated as always open; a location with `openingHours` but no window for
-- the current day is closed that day.
-- ---------------------------------------------------------------------------
create or replace function app_is_open_at(v_settings jsonb, v_timezone text, v_at timestamptz)
returns boolean language plpgsql immutable as $$
declare
  v_hours jsonb; v_windows jsonb; v_window jsonb;
  v_local timestamp; v_dow integer; v_time text; v_start text; v_end text;
begin
  -- No opening hours at all means the location has not declared a schedule and
  -- is treated as open. A malformed value is a configuration error, not a
  -- licence to sell at any hour.
  if v_settings is null or not (v_settings ? 'openingHours') then return true; end if;
  if jsonb_typeof(v_settings->'openingHours') <> 'object' then raise exception 'INVALID_OPENING_HOURS'; end if;
  v_hours := v_settings->'openingHours';
  v_local := v_at at time zone v_timezone;
  v_dow := extract(dow from v_local)::integer;
  v_time := to_char(v_local, 'HH24:MI');
  v_windows := v_hours -> v_dow::text;
  if v_windows is null or jsonb_typeof(v_windows) <> 'array' or jsonb_array_length(v_windows) = 0 then return false; end if;
  for v_window in select value from jsonb_array_elements(v_windows) loop
    v_start := v_window->>0;
    v_end := v_window->>1;
    if v_start is null or v_end is null then continue; end if;
    if v_end > v_start then
      if v_time >= v_start and v_time < v_end then return true; end if;
    elsif v_time >= v_start or v_time < v_end then
      return true;
    end if;
  end loop;
  return false;
end $$;

-- ---------------------------------------------------------------------------
-- Server-side pricing.
--
-- Prices are resolved from the published price book; the client never sends a
-- price. Modifiers are validated against the item's own option groups and
-- their selection limits. Everything is computed in integer minor units of the
-- location currency.
-- ---------------------------------------------------------------------------
create or replace function app_price_order_lines(
  p_location_id uuid, p_organization_id uuid, p_currency text, p_items jsonb
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_lines jsonb := '[]'::jsonb;
  v_subtotal bigint := 0;
  v_item jsonb; v_mod jsonb;
  v_quantity integer; v_mod_quantity integer;
  v_menu_item_id uuid; v_name text; v_description text;
  v_base_price bigint; v_unit_delta bigint; v_unit_price bigint;
  v_modifier_id uuid; v_modifier_name text; v_modifier_price bigint;
  v_modifier_group_id uuid; v_group_max integer; v_group_type text;
  v_modifiers jsonb; v_snapshot jsonb; v_counts jsonb := '{}'::jsonb;
  v_option_group_id uuid; v_option_min integer; v_option_max integer; v_count integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'INVALID_REQUEST'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'INVALID_REQUEST'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := coalesce((v_item->>'quantity')::integer, 0);
    if v_quantity not between 1 and 100 then raise exception 'INVALID_QUANTITY'; end if;

    select mi.id, mi.name, mi.description into v_menu_item_id, v_name, v_description
      from menu_items mi
      where mi.id = coalesce((v_item->>'menuItemId')::uuid, gen_random_uuid())
        and mi.location_id = p_location_id
        and mi.organization_id = p_organization_id
        and mi.available = true;
    if not found then raise exception 'ITEM_UNAVAILABLE'; end if;

    select ip.amount_minor into v_base_price
      from item_prices ip
      join price_books pb on pb.id = ip.price_book_id
      where ip.menu_item_id = v_menu_item_id
        and pb.status = 'published'
        and pb.currency = p_currency;
    if not found or v_base_price is null then raise exception 'ITEM_UNAVAILABLE'; end if;

    v_modifiers := coalesce(v_item->'modifiers', '[]'::jsonb);
    if jsonb_typeof(v_modifiers) <> 'array' then raise exception 'INVALID_REQUEST'; end if;
    if jsonb_array_length(v_modifiers) > 50 then raise exception 'INVALID_REQUEST'; end if;

    v_unit_delta := 0;
    v_snapshot := '[]'::jsonb;
    v_counts := '{}'::jsonb;

    for v_mod in select value from jsonb_array_elements(v_modifiers) loop
      v_mod_quantity := coalesce((v_mod->>'quantity')::integer, 1);
      if v_mod_quantity not between 1 and 20 then raise exception 'INVALID_QUANTITY'; end if;
      select mo.id, mo.name, mo.price_delta_minor, mg.id, mg.max_selections, mg.selection_type
        into v_modifier_id, v_modifier_name, v_modifier_price, v_modifier_group_id, v_group_max, v_group_type
        from modifiers mo
        join modifier_groups mg on mg.id = mo.modifier_group_id
        where mo.id = coalesce((v_mod->>'modifierId')::uuid, gen_random_uuid())
          and mo.organization_id = p_organization_id
          and mo.location_id = p_location_id
          and mo.available = true
          and mg.menu_item_id = v_menu_item_id;
      if not found then raise exception 'MODIFIER_NOT_ALLOWED'; end if;

      v_count := coalesce((v_counts ->> v_modifier_group_id::text)::integer, 0) + 1;
      if v_count > v_group_max then raise exception 'MODIFIER_SELECTION_LIMIT'; end if;
      v_counts := jsonb_set(v_counts, ARRAY[v_modifier_group_id::text], to_jsonb(v_count));

      v_unit_delta := v_unit_delta + v_modifier_price * v_mod_quantity;
      v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
        'modifierId', v_modifier_id, 'name', v_modifier_name,
        'priceDeltaMinor', v_modifier_price, 'quantity', v_mod_quantity));
    end loop;

    -- Every option group attached to the item must satisfy its own selection limits.
    for v_option_group_id, v_option_min, v_option_max in
      select mg.id, mg.min_selections, mg.max_selections
        from modifier_groups mg where mg.menu_item_id = v_menu_item_id
    loop
      v_count := coalesce((v_counts ->> v_option_group_id::text)::integer, 0);
      if v_count < v_option_min then raise exception 'MODIFIER_SELECTION_REQUIRED'; end if;
      if v_count > v_option_max then raise exception 'MODIFIER_SELECTION_LIMIT'; end if;
    end loop;

    v_unit_price := v_base_price + v_unit_delta;
    v_subtotal := v_subtotal + v_unit_price * v_quantity;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'menuItemId', v_menu_item_id, 'name', v_name, 'description', v_description,
      'quantity', v_quantity, 'unitPriceMinor', v_unit_price,
      'basePriceMinor', v_base_price, 'selections', v_snapshot));
  end loop;

  return jsonb_build_object('lines', v_lines, 'subtotalMinor', v_subtotal::text);
end $$;

-- ---------------------------------------------------------------------------
-- Promotion resolution. Discounts are only ever granted from an active
-- promotion row; the client cannot state its own discount amount.
-- ---------------------------------------------------------------------------
create or replace function app_resolve_discount(
  p_location_id uuid, p_organization_id uuid, p_code text, p_subtotal_minor bigint
) returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_promotion promotions%rowtype; v_discount bigint;
begin
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('code', null, 'discountMinor', 0);
  end if;
  select * into v_promotion from promotions
    where location_id = p_location_id and organization_id = p_organization_id
      and lower(code) = lower(btrim(p_code)) and active = true
    for update;
  if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;
  if v_promotion.starts_at is not null and now() < v_promotion.starts_at then raise exception 'PROMOTION_NOT_ACTIVE'; end if;
  if v_promotion.ends_at is not null and now() > v_promotion.ends_at then raise exception 'PROMOTION_NOT_ACTIVE'; end if;
  if v_promotion.max_redemptions is not null and v_promotion.redeemed_count >= v_promotion.max_redemptions then raise exception 'PROMOTION_EXHAUSTED'; end if;
  if p_subtotal_minor < v_promotion.min_subtotal_minor then raise exception 'PROMOTION_MINIMUM_NOT_MET'; end if;

  if v_promotion.discount_type = 'percent' then
    v_discount := (p_subtotal_minor * v_promotion.discount_basis_points + 5000) / 10000;
  else
    v_discount := v_promotion.discount_minor;
  end if;
  if v_promotion.max_discount_minor is not null and v_discount > v_promotion.max_discount_minor then
    v_discount := v_promotion.max_discount_minor;
  end if;
  if v_discount > p_subtotal_minor then v_discount := p_subtotal_minor; end if;
  return jsonb_build_object('code', v_promotion.code, 'discountMinor', v_discount, 'promotionId', v_promotion.id);
end $$;

-- ---------------------------------------------------------------------------
-- Storefront order.
--
-- Replaces the earlier five-argument version. Prices, discounts, tax, fees and
-- service hours are all resolved on the server.
-- ---------------------------------------------------------------------------
drop function if exists app_create_order(uuid, text, text, jsonb, timestamptz);
create function app_create_order(
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

  -- Delivery service area. The postal code list comes from the location's own
  -- service settings; the customer supplies the destination.
  if p_service_type = 'delivery' then
    if p_delivery_address is null or btrim(p_delivery_address) = '' then raise exception 'DELIVERY_ADDRESS_REQUIRED'; end if;
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

  v_priced := app_price_order_lines(p_location_id, v_organization_id, v_currency, p_items);
  v_lines := v_priced->'lines';
  v_subtotal := (v_priced->>'subtotalMinor')::bigint;

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
    delivery_address, delivery_postal_code, source_channel
  ) values (
    v_organization_id, p_location_id, v_tracking, p_service_type, p_customer_locale, v_currency,
    v_subtotal, v_discount, v_tax, v_tip, v_total,
    v_delivery_fee, v_tax_basis_points, v_discount_info->>'code', p_scheduled_for,
    p_delivery_address, p_delivery_postal_code, 'storefront'
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
    'totalMinor', v_total::text, 'paymentStatus', 'unpaid');
end $$;

-- ---------------------------------------------------------------------------
-- Staff (POS) order.
--
-- A staff member can open a walk-in, phone, takeaway or dine-in order. Cash and
-- counter tenders settle immediately and create the kitchen ticket at once;
-- other tenders leave the order unpaid for the normal checkout flow.
-- ---------------------------------------------------------------------------
create function app_create_staff_order(
  p_location_id uuid,
  p_service_type text,
  p_customer_locale text,
  p_items jsonb,
  p_actor uuid,
  p_tender_type text default null,
  p_table_id uuid default null,
  p_customer_name text default null,
  p_scheduled_for timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_currency text; v_settings jsonb;
  v_order_id uuid; v_ticket_id uuid; v_tracking text;
  v_priced jsonb; v_lines jsonb; v_line jsonb;
  v_subtotal bigint; v_tax bigint; v_total bigint;
  v_tax_basis_points integer; v_tax_inclusive boolean;
  v_paid boolean := false;
begin
  if p_service_type !~ '^(walk_in|phone|takeaway|dine_in|catering|pickup)$' then raise exception 'INVALID_REQUEST'; end if;
  if p_customer_locale !~ '^(en|fr|es|pt|ar)$' then raise exception 'INVALID_REQUEST'; end if;
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  if not exists (
    select 1 from memberships
    where organization_id = (select organization_id from locations where id = p_location_id)
      and user_id = p_actor and role in ('owner','manager','host','server','kitchen')
  ) then raise exception 'FORBIDDEN'; end if;

  select organization_id, currency, service_settings into v_organization_id, v_currency, v_settings
    from locations where id = p_location_id;
  if not found then raise exception 'INVALID_REQUEST'; end if;

  if p_tender_type is not null then
    if p_tender_type !~ '^(cash|counter|external_terminal)$' then raise exception 'INVALID_REQUEST'; end if;
    v_paid := true;
  end if;

  v_priced := app_price_order_lines(p_location_id, v_organization_id, v_currency, p_items);
  v_lines := v_priced->'lines';
  v_subtotal := (v_priced->>'subtotalMinor')::bigint;

  v_tax_basis_points := coalesce((v_settings->>'taxBasisPoints')::integer, 0);
  v_tax_inclusive := coalesce(v_settings->>'pricingMode' = 'tax_inclusive', false);
  if v_tax_inclusive then
    v_tax := v_subtotal - (v_subtotal * 10000 / (10000 + v_tax_basis_points));
  else
    v_tax := (v_subtotal * v_tax_basis_points + 5000) / 10000;
  end if;
  v_total := v_subtotal + v_tax;

  v_tracking := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into orders(
    organization_id, location_id, tracking_token, service_type, customer_locale, currency,
    subtotal_minor, tax_minor, total_minor, source_channel, tender_type, payment_provider, payment_status
  ) values (
    v_organization_id, p_location_id, v_tracking, p_service_type, p_customer_locale, v_currency,
    v_subtotal, v_tax, v_total, 'pos', p_tender_type,
    case when p_tender_type = 'cash' then 'cash' else 'counter' end,
    case when v_paid then 'paid' else 'unpaid' end
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

  -- A staff order always produces exactly one kitchen ticket.
  insert into kitchen_tickets(organization_id, location_id, order_id)
    values (v_organization_id, p_location_id, v_order_id)
    on conflict(order_id) do nothing
    returning id into v_ticket_id;

  if v_paid then
    insert into outbox_events(organization_id, event_key, event_type, payload)
      values (v_organization_id, 'order.paid:' || v_order_id::text, 'order.paid',
        jsonb_build_object('orderId', v_order_id, 'channel', 'pos'))
      on conflict(event_key) do nothing;
    insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
      values (v_organization_id, p_actor, 'order.paid', 'order', v_order_id::text,
        jsonb_build_object('tender', p_tender_type, 'totalMinor', v_total::text));
  end if;

  return jsonb_build_object(
    'orderId', v_order_id, 'ticketId', v_ticket_id, 'currency', v_currency,
    'subtotalMinor', v_subtotal::text, 'taxMinor', v_tax::text, 'totalMinor', v_total::text,
    'paymentStatus', case when v_paid then 'paid' else 'unpaid' end);
end $$;

-- ---------------------------------------------------------------------------
-- Kitchen ticket transitions (KDS).
-- ---------------------------------------------------------------------------
create function app_transition_ticket(p_ticket_id uuid, p_to_status text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ticket kitchen_tickets%rowtype; v_order_id uuid; v_current text;
  v_allowed text[];
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select * into v_ticket from kitchen_tickets where id = p_ticket_id for update;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
  if not exists (
    select 1 from memberships where organization_id = v_ticket.organization_id
      and user_id = p_actor and role in ('owner','manager','host','server','kitchen')
  ) then raise exception 'FORBIDDEN'; end if;

  v_current := v_ticket.status;
  if v_current = 'new' then v_allowed := array['preparing'];
  elsif v_current = 'preparing' then v_allowed := array['ready','recalled'];
  elsif v_current = 'ready' then v_allowed := array['served','recalled'];
  elsif v_current = 'recalled' then v_allowed := array['preparing'];
  else v_allowed := array[]::text[]; end if;

  if not (p_to_status = any(v_allowed)) then raise exception 'INVALID_TICKET_TRANSITION'; end if;

  update kitchen_tickets
     set status = p_to_status,
         ready_at = case when p_to_status = 'ready' then now() else ready_at end,
         served_at = case when p_to_status = 'served' then now() else served_at end,
         updated_at = now()
   where id = p_ticket_id;

  v_order_id := v_ticket.order_id;
  update orders
     set fulfillment_status = case p_to_status
            when 'new' then 'received'
            when 'preparing' then 'preparing'
            when 'ready' then 'ready'
            when 'served' then 'served'
            when 'recalled' then 'preparing'
            else fulfillment_status end
   where id = v_order_id;

  insert into outbox_events(organization_id, event_key, event_type, payload)
    values (v_ticket.organization_id, 'ticket.' || p_to_status || ':' || p_ticket_id::text,
      'kitchen.ticket_' || p_to_status, jsonb_build_object('ticketId', p_ticket_id, 'orderId', v_order_id))
    on conflict(event_key) do nothing;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_ticket.organization_id, p_actor, 'ticket.transitioned', 'kitchen_ticket', p_ticket_id::text,
      jsonb_build_object('from', v_current, 'to', p_to_status));

  return jsonb_build_object('ticketId', p_ticket_id, 'status', p_to_status, 'orderId', v_order_id);
end $$;

-- ---------------------------------------------------------------------------
-- Verified online payment.
--
-- Replaces the earlier version so a settled provider payment is also recorded
-- with its tender and provider. Cash reconciliation counts only cash tenders.
-- ---------------------------------------------------------------------------
create or replace function app_apply_verified_payment(
  p_payment_attempt_id uuid, p_provider_event_id text, p_provider_reference text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_attempt payment_attempts%rowtype; v_order orders%rowtype;
begin
  select * into v_attempt from payment_attempts where id=p_payment_attempt_id for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if not exists(select 1 from payment_events where payment_attempt_id=v_attempt.id and provider=v_attempt.provider and provider_event_id=p_provider_event_id) then raise exception 'EVENT_NOT_DURABLE'; end if;
  select * into v_order from orders where id=v_attempt.order_id for update;
  if v_order.payment_status = 'paid' then
    if v_attempt.status = 'succeeded' then return jsonb_build_object('status','already_applied'); end if;
    update payment_attempts set status='duplicate_success', updated_at=now() where id=v_attempt.id;
    insert into outbox_events(organization_id, event_key, event_type, payload) values (v_attempt.organization_id, 'payment.duplicate-success:'||v_attempt.id::text, 'payment.review_required', jsonb_build_object('attemptId',v_attempt.id,'orderId',v_order.id)) on conflict(event_key) do nothing;
    return jsonb_build_object('status','duplicate_success_review');
  end if;
  update payment_attempts set status='succeeded', provider_reference=p_provider_reference, updated_at=now() where id=v_attempt.id;
  update orders set payment_status='paid', tender_type=coalesce(tender_type,'online'), payment_provider=coalesce(payment_provider, v_attempt.provider) where id=v_order.id;
  insert into kitchen_tickets(organization_id, location_id, order_id) values (v_order.organization_id, v_order.location_id, v_order.id) on conflict(order_id) do nothing;
  insert into outbox_events(organization_id, event_key, event_type, payload) values (v_order.organization_id, 'order.paid:'||v_order.id::text, 'order.paid', jsonb_build_object('orderId',v_order.id,'attemptId',v_attempt.id)) on conflict(event_key) do nothing;
  insert into audit_events(organization_id, action, entity_type, entity_id, metadata) values (v_order.organization_id, 'payment.applied', 'order', v_order.id::text, jsonb_build_object('attemptId',v_attempt.id,'provider',v_attempt.provider));
  return jsonb_build_object('status','applied');
end $$;

-- ---------------------------------------------------------------------------
-- Refunds.
--
-- Authorised staff request a refund against a settled attempt. The refundable
-- limit is the settled amount minus everything already requested. A refund is
-- recorded as requested; provider confirmation is a separate state.
-- ---------------------------------------------------------------------------
create function app_request_refund(
  p_attempt_id uuid, p_amount_minor bigint, p_reason text, p_actor uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_attempt payment_attempts%rowtype; v_refunded bigint := 0; v_refund_id uuid; v_limit bigint;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception 'INVALID_REQUEST'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'INVALID_REQUEST'; end if;

  select * into v_attempt from payment_attempts where id = p_attempt_id for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if v_attempt.status <> 'succeeded' then raise exception 'PAYMENT_NOT_SETTLED'; end if;
  if not exists (
    select 1 from memberships where organization_id = v_attempt.organization_id
      and user_id = p_actor and role in ('owner','manager','accountant')
  ) then raise exception 'FORBIDDEN'; end if;

  select coalesce(sum(amount_minor), 0) into v_refunded from refunds
    where payment_attempt_id = p_attempt_id and status in ('requested','confirmed');
  v_limit := v_attempt.amount_minor - v_refunded;
  if v_limit < 0 then v_limit := 0; end if;
  if p_amount_minor > v_limit then raise exception 'REFUND_LIMIT_EXCEEDED'; end if;

  insert into refunds(organization_id, location_id, payment_attempt_id, amount_minor, currency, reason, status, requested_by)
    values (v_attempt.organization_id, v_attempt.location_id, p_attempt_id, p_amount_minor, v_attempt.currency, btrim(p_reason), 'requested', p_actor)
    returning id into v_refund_id;

  insert into outbox_events(organization_id, event_key, event_type, payload)
    values (v_attempt.organization_id, 'refund.requested:' || v_refund_id::text, 'refund.requested',
      jsonb_build_object('refundId', v_refund_id, 'attemptId', p_attempt_id,
        'amountMinor', p_amount_minor::text, 'currency', v_attempt.currency))
    on conflict(event_key) do nothing;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_attempt.organization_id, p_actor, 'refund.requested', 'refund', v_refund_id::text,
      jsonb_build_object('attemptId', p_attempt_id, 'amountMinor', p_amount_minor::text));

  return jsonb_build_object('refundId', v_refund_id, 'status', 'requested',
    'amountMinor', p_amount_minor::text, 'currency', v_attempt.currency,
    'remainingRefundableMinor', (v_limit - p_amount_minor)::text);
end $$;

-- ---------------------------------------------------------------------------
-- Cash shifts.
-- ---------------------------------------------------------------------------
create function app_open_shift(p_location_id uuid, p_opening_minor bigint, p_actor uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid; v_currency text; v_shift_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  if p_opening_minor is null or p_opening_minor < 0 then raise exception 'INVALID_REQUEST'; end if;
  select organization_id, currency into v_organization_id, v_currency from locations where id = p_location_id;
  if not found then raise exception 'INVALID_REQUEST'; end if;
  if not exists (
    select 1 from memberships where organization_id = v_organization_id
      and user_id = p_actor and role in ('owner','manager','server','accountant')
  ) then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from cash_shifts where location_id = p_location_id and status = 'open') then
    raise exception 'SHIFT_ALREADY_OPEN';
  end if;
  insert into cash_shifts(organization_id, location_id, opened_by, opening_minor, currency)
    values (v_organization_id, p_location_id, p_actor, p_opening_minor, v_currency)
    returning id into v_shift_id;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, p_actor, 'shift.opened', 'cash_shift', v_shift_id::text,
      jsonb_build_object('openingMinor', p_opening_minor::text));
  return v_shift_id;
end $$;

create function app_close_shift(p_shift_id uuid, p_counted_minor bigint, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_shift cash_shifts%rowtype; v_cash_total bigint := 0; v_expected bigint; v_variance bigint;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  if p_counted_minor is null or p_counted_minor < 0 then raise exception 'INVALID_REQUEST'; end if;
  select * into v_shift from cash_shifts where id = p_shift_id for update;
  if not found then raise exception 'SHIFT_NOT_FOUND'; end if;
  if v_shift.status <> 'open' then raise exception 'SHIFT_NOT_OPEN'; end if;
  if not exists (
    select 1 from memberships where organization_id = v_shift.organization_id
      and user_id = p_actor and role in ('owner','manager','server','accountant')
  ) then raise exception 'FORBIDDEN'; end if;

  select coalesce(sum(total_minor), 0) into v_cash_total from orders
   where location_id = v_shift.location_id
     and tender_type = 'cash'
     and payment_status in ('paid','partially_refunded')
     and created_at >= v_shift.opened_at
     and (v_shift.closed_at is null or created_at <= v_shift.closed_at);

  v_expected := v_shift.opening_minor + v_cash_total;
  v_variance := p_counted_minor - v_expected;

  update cash_shifts
     set closed_by = p_actor, counted_minor = p_counted_minor, expected_minor = v_expected,
         variance_minor = v_variance,
         status = case when v_variance = 0 then 'closed' else 'review' end,
         closed_at = now()
   where id = p_shift_id;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_shift.organization_id, p_actor, 'shift.closed', 'cash_shift', p_shift_id::text,
      jsonb_build_object('expectedMinor', v_expected::text, 'countedMinor', p_counted_minor::text,
        'varianceMinor', v_variance::text));

  return jsonb_build_object('shiftId', p_shift_id, 'openingMinor', v_shift.opening_minor::text,
    'cashSalesMinor', v_cash_total::text, 'expectedMinor', v_expected::text,
    'countedMinor', p_counted_minor::text, 'varianceMinor', v_variance::text,
    'status', case when v_variance = 0 then 'closed' else 'review' end);
end $$;

-- ---------------------------------------------------------------------------
-- Reservations.
--
-- Capacity and table conflicts are checked inside the same transaction that
-- writes the booking, so two concurrent requests cannot overbook a room.
-- ---------------------------------------------------------------------------
create function app_create_reservation(
  p_location_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_party_size integer,
  p_customer_name text,
  p_customer_email text,
  p_actor uuid,
  p_table_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_settings jsonb; v_capacity integer;
  v_booked bigint := 0; v_reservation_id uuid; v_seats integer;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  if p_ends_at <= p_starts_at then raise exception 'INVALID_REQUEST'; end if;
  if p_party_size is null or p_party_size < 1 then raise exception 'INVALID_REQUEST'; end if;
  if p_customer_name is null or btrim(p_customer_name) = '' then raise exception 'INVALID_REQUEST'; end if;

  select organization_id, service_settings into v_organization_id, v_settings
    from locations where id = p_location_id;
  if not found then raise exception 'INVALID_REQUEST'; end if;
  if not exists (
    select 1 from memberships where organization_id = v_organization_id
      and user_id = p_actor and role in ('owner','manager','host','server')
  ) then raise exception 'FORBIDDEN'; end if;

  v_capacity := coalesce((v_settings->>'seatingCapacity')::integer, 0);
  v_seats := coalesce((select sum(rt.capacity) from restaurant_tables rt
                         where rt.location_id = p_location_id
                           and (p_table_id is null or rt.id = p_table_id)), 0);
  if coalesce(v_capacity, 0) = 0 then v_capacity := v_seats; end if;
  if v_capacity <= 0 then raise exception 'RESERVATION_CAPACITY_UNKNOWN'; end if;
  if p_party_size > v_capacity then raise exception 'RESERVATION_CAPACITY_EXCEEDED'; end if;

  select coalesce(sum(r.party_size), 0) into v_booked from reservations r
   where r.location_id = p_location_id
     and r.status in ('booked','seated')
     and r.starts_at < p_ends_at and r.ends_at > p_starts_at;
  if v_booked + p_party_size > v_capacity then raise exception 'RESERVATION_CAPACITY_EXCEEDED'; end if;

  if p_table_id is not null then
    if not exists (select 1 from restaurant_tables rt
                    where rt.id = p_table_id and rt.location_id = p_location_id) then
      raise exception 'TABLE_NOT_FOUND';
    end if;
    if exists (select 1 from reservations r
                where r.table_id = p_table_id and r.status in ('booked','seated')
                  and r.starts_at < p_ends_at and r.ends_at > p_starts_at) then
      raise exception 'TABLE_ALREADY_BOOKED';
    end if;
  end if;

  insert into reservations(organization_id, location_id, table_id, starts_at, ends_at, party_size, status)
    values (v_organization_id, p_location_id, p_table_id, p_starts_at, p_ends_at, p_party_size, 'booked')
    returning id into v_reservation_id;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, p_actor, 'reservation.created', 'reservation', v_reservation_id::text,
      jsonb_build_object('partySize', p_party_size, 'startsAt', p_starts_at));

  return jsonb_build_object('reservationId', v_reservation_id, 'status', 'booked',
    'partySize', p_party_size, 'startsAt', p_starts_at, 'endsAt', p_ends_at);
end $$;

-- ---------------------------------------------------------------------------
-- Grants and row level security for the new tables.
-- ---------------------------------------------------------------------------
grant execute on function app_create_order(uuid, text, text, jsonb, timestamptz, text, bigint, text, text) to service_role;
grant execute on function app_create_staff_order(uuid, text, text, jsonb, uuid, text, uuid, text, timestamptz) to authenticated;
grant execute on function app_transition_ticket(uuid, text, uuid) to authenticated;
grant execute on function app_request_refund(uuid, bigint, text, uuid) to authenticated;
grant execute on function app_open_shift(uuid, bigint, uuid) to authenticated;
grant execute on function app_close_shift(uuid, bigint, uuid) to authenticated;
grant execute on function app_create_reservation(uuid, timestamptz, timestamptz, integer, text, text, uuid, uuid) to authenticated;

revoke all on function app_create_order(uuid, text, text, jsonb, timestamptz, text, bigint, text, text) from public;
revoke all on function app_create_staff_order(uuid, text, text, jsonb, uuid, text, uuid, text, timestamptz) from public;
revoke all on function app_transition_ticket(uuid, text, uuid) from public;
revoke all on function app_request_refund(uuid, bigint, text, uuid) from public;
revoke all on function app_open_shift(uuid, bigint, uuid) from public;
revoke all on function app_close_shift(uuid, bigint, uuid) from public;
revoke all on function app_create_reservation(uuid, timestamptz, timestamptz, integer, text, text, uuid, uuid) from public;

alter table public.modifier_groups enable row level security;
alter table public.modifiers enable row level security;
alter table public.promotions enable row level security;

create policy modifier_groups_member_read on modifier_groups for select to authenticated using (is_organization_member(organization_id));
create policy modifier_groups_manager_write on modifier_groups for all to authenticated using (is_organization_manager(organization_id)) with check (is_organization_manager(organization_id));
create policy modifiers_member_read on modifiers for select to authenticated using (is_organization_member(organization_id));
create policy modifiers_manager_write on modifiers for all to authenticated using (is_organization_manager(organization_id)) with check (is_organization_manager(organization_id));
create policy promotions_member_read on promotions for select to authenticated using (is_organization_member(organization_id));
create policy promotions_manager_write on promotions for all to authenticated using (is_organization_manager(organization_id)) with check (is_organization_manager(organization_id));

commit;
