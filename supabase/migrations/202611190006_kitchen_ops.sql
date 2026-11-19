begin;

-- ---------------------------------------------------------------------------
-- Kitchen operations, recipes and reporting.
--
-- Adds the three operational layers the restaurant market treats as one
-- system: routing a ticket to a named station, costing a menu item from its
-- recipe and depleting stock exactly once per sold item, and reporting the
-- day from the orders themselves.
-- ---------------------------------------------------------------------------

-- Named production areas (grill, fry, cold prep, expo).
create table kitchen_stations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  name text not null,
  color text not null default 'slate',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict,
  unique (location_id, name)
);

-- The station a menu item is prepared at. A null value means the default
-- expo station.
alter table menu_items add column prep_station text;

-- Recipe: what a menu item consumes.
create table menu_item_ingredients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  menu_item_id uuid not null references menu_items(id) on delete restrict,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  quantity_milli_units bigint not null check (quantity_milli_units > 0),
  waste_percent integer not null default 0 check (waste_percent between 0 and 100),
  created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict,
  unique (menu_item_id, ingredient_id)
);

-- Cost of one base unit of an ingredient, in the location currency.
alter table ingredients add column unit_cost_minor bigint not null default 0 check (unit_cost_minor >= 0);

-- One row per order line on the kitchen ticket, so it can be bumped on its own.
create table kitchen_ticket_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  ticket_id uuid not null references kitchen_tickets(id) on delete restrict,
  order_item_id uuid not null references order_items(id) on delete restrict,
  station text not null default 'expo',
  status text not null default 'new' check (status in ('new','holding','preparing','ready','served')),
  fired_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict,
  unique (ticket_id, order_item_id)
);

-- A human ticket number, per location, in the order the tickets arrived.
alter table kitchen_tickets add column ticket_number bigint;

-- An order taken at a table records the table, and the guest it is for.
-- Without these the kitchen cannot show what a ticket is for.
alter table orders add column if not exists table_id uuid references restaurant_tables(id) on delete restrict;
alter table orders add column if not exists customer_name text;

-- Per line instructions the kitchen must see: an allergy the guest raised and
-- a note for the chef.
alter table order_items add column if not exists allergy_note text;
alter table order_items add column if not exists kitchen_note text;

create index kitchen_stations_location on kitchen_stations(location_id, sort_order);
create index menu_item_ingredients_item on menu_item_ingredients(menu_item_id);
create index kitchen_ticket_items_ticket on kitchen_ticket_items(ticket_id);
create index kitchen_ticket_items_station on kitchen_ticket_items(location_id, station, status);

-- ---------------------------------------------------------------------------
-- Row level security.
-- ---------------------------------------------------------------------------
alter table kitchen_stations enable row level security;
alter table menu_item_ingredients enable row level security;
alter table kitchen_ticket_items enable row level security;

create policy kitchen_stations_read on kitchen_stations for select using (
  exists (select 1 from memberships m where m.organization_id = kitchen_stations.organization_id and m.user_id = auth.uid())
);
create policy kitchen_stations_write on kitchen_stations for all using (
  exists (select 1 from memberships m where m.organization_id = kitchen_stations.organization_id and m.user_id = auth.uid() and m.role in ('owner','manager'))
) with check (
  exists (select 1 from memberships m where m.organization_id = kitchen_stations.organization_id and m.user_id = auth.uid() and m.role in ('owner','manager'))
);

create policy menu_item_ingredients_read on menu_item_ingredients for select using (
  exists (select 1 from memberships m where m.organization_id = menu_item_ingredients.organization_id and m.user_id = auth.uid())
);
create policy menu_item_ingredients_write on menu_item_ingredients for all using (
  exists (select 1 from memberships m where m.organization_id = menu_item_ingredients.organization_id and m.user_id = auth.uid() and m.role in ('owner','manager'))
) with check (
  exists (select 1 from memberships m where m.organization_id = menu_item_ingredients.organization_id and m.user_id = auth.uid() and m.role in ('owner','manager'))
);

create policy kitchen_ticket_items_read on kitchen_ticket_items for select using (
  exists (select 1 from memberships m where m.organization_id = kitchen_ticket_items.organization_id and m.user_id = auth.uid())
);
create policy kitchen_ticket_items_write on kitchen_ticket_items for all using (
  exists (select 1 from memberships m where m.organization_id = kitchen_ticket_items.organization_id and m.user_id = auth.uid() and m.role in ('owner','manager','kitchen','server'))
) with check (
  exists (select 1 from memberships m where m.organization_id = kitchen_ticket_items.organization_id and m.user_id = auth.uid() and m.role in ('owner','manager','kitchen','server'))
);

-- ---------------------------------------------------------------------------
-- Membership helper.
-- ---------------------------------------------------------------------------
create or replace function app_actor_scope(p_location_id uuid, p_actor uuid, p_roles text[])
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'INVALID_REQUEST'; end if;
  if not exists (
    select 1 from memberships
    where organization_id = v_organization_id and user_id = p_actor and role = any(p_roles)
  ) then raise exception 'FORBIDDEN'; end if;
  return v_organization_id;
end $$;

-- ---------------------------------------------------------------------------
-- Configuration: stations, recipes and prep routing.
-- ---------------------------------------------------------------------------
create or replace function app_upsert_station(
  p_location_id uuid, p_name text, p_color text, p_sort_order integer, p_actor uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_id uuid;
begin
  v_organization_id := app_actor_scope(p_location_id, p_actor, array['owner','manager']);
  if p_name is null or btrim(p_name) = '' then raise exception 'INVALID_REQUEST'; end if;

  insert into kitchen_stations(organization_id, location_id, name, color, sort_order)
    values (v_organization_id, p_location_id, btrim(p_name), coalesce(p_color, 'slate'), coalesce(p_sort_order, 0))
    on conflict (location_id, name) do update
      set color = excluded.color, sort_order = excluded.sort_order, active = true
    returning id into v_id;

  return jsonb_build_object('stationId', v_id, 'name', btrim(p_name));
end $$;

create or replace function app_set_recipe_item(
  p_location_id uuid, p_menu_item_id uuid, p_ingredient_id uuid,
  p_quantity_milli_units bigint, p_waste_percent integer, p_actor uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_id uuid;
begin
  v_organization_id := app_actor_scope(p_location_id, p_actor, array['owner','manager']);
  if p_quantity_milli_units is null or p_quantity_milli_units <= 0 then raise exception 'INVALID_REQUEST'; end if;

  if not exists (select 1 from menu_items where id = p_menu_item_id and location_id = p_location_id) then
    raise exception 'ITEM_NOT_FOUND';
  end if;
  if not exists (select 1 from ingredients where id = p_ingredient_id and location_id = p_location_id) then
    raise exception 'INGREDIENT_NOT_FOUND';
  end if;

  insert into menu_item_ingredients(
    organization_id, location_id, menu_item_id, ingredient_id, quantity_milli_units, waste_percent)
    values (v_organization_id, p_location_id, p_menu_item_id, p_ingredient_id, p_quantity_milli_units, coalesce(p_waste_percent, 0))
    on conflict (menu_item_id, ingredient_id) do update
      set quantity_milli_units = excluded.quantity_milli_units, waste_percent = excluded.waste_percent
    returning id into v_id;

  return jsonb_build_object('recipeItemId', v_id, 'menuItemId', p_menu_item_id, 'ingredientId', p_ingredient_id);
end $$;

create or replace function app_set_prep_station(
  p_location_id uuid, p_menu_item_id uuid, p_station text, p_actor uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid;
begin
  v_organization_id := app_actor_scope(p_location_id, p_actor, array['owner','manager']);
  if not exists (select 1 from menu_items where id = p_menu_item_id and location_id = p_location_id) then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  update menu_items
     set prep_station = nullif(btrim(coalesce(p_station, '')), '')
   where id = p_menu_item_id and location_id = p_location_id;

  return jsonb_build_object('menuItemId', p_menu_item_id, 'prepStation', nullif(btrim(coalesce(p_station, '')), ''));
end $$;

-- Records what a restaurant buys in. The event id makes a repeated receipt
-- from the same device idempotent instead of doubling the stock.
--
-- The event id is scoped to the location, because two restaurants can both
-- receive delivery note 42 on the same day and neither may swallow the
-- other's delivery.
create or replace function app_record_stock_receipt(
  p_location_id uuid, p_ingredient_id uuid, p_quantity_milli_units bigint, p_event_id text, p_actor uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_movement_id uuid; v_event_key text;
begin
  v_organization_id := app_actor_scope(p_location_id, p_actor, array['owner','manager','kitchen']);
  if p_quantity_milli_units is null or p_quantity_milli_units <= 0 then raise exception 'INVALID_REQUEST'; end if;
  if p_event_id is null or btrim(p_event_id) = '' then raise exception 'INVALID_REQUEST'; end if;
  if not exists (select 1 from ingredients where id = p_ingredient_id and location_id = p_location_id) then
    raise exception 'INGREDIENT_NOT_FOUND';
  end if;

  v_event_key := 'receipt:' || p_location_id::text || ':' || btrim(p_event_id);

  select id into v_movement_id from stock_movements where event_id = v_event_key;

  if v_movement_id is null then
    insert into stock_movements(
      organization_id, location_id, ingredient_id, event_id, kind, quantity_milli_units, actor_id)
      values (v_organization_id, p_location_id, p_ingredient_id, v_event_key, 'receipt', p_quantity_milli_units, p_actor)
      on conflict (event_id) do nothing
      returning id into v_movement_id;
  end if;

  return jsonb_build_object(
    'movementId', v_movement_id,
    'alreadyRecorded', (select count(*) from stock_movements where event_id = v_event_key) > 1);
end $$;

-- ---------------------------------------------------------------------------
-- Kitchen board.
--
-- The board is the screen a kitchen looks at: tickets grouped by station, with
-- the order number, the service type, the table and the elapsed time. Tickets
-- that predate per-line routing are brought onto the board the first time it
-- is opened, and given the next ticket number for their location.
-- ---------------------------------------------------------------------------
create or replace function app_kitchen_board(p_location_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_ticket jsonb; v_result jsonb;
  v_ticket_ids uuid[]; v_next_number bigint;
begin
  v_organization_id := app_actor_scope(p_location_id, p_actor, array['owner','manager','kitchen','server','host']);

  -- Ticket numbers are assigned in arrival order and only once.
  select coalesce(max(ticket_number), 0) + 1 into v_next_number
    from kitchen_tickets where location_id = p_location_id;

  update kitchen_tickets t
     set ticket_number = v_next_number + (
       select count(*) from kitchen_tickets earlier
        where earlier.location_id = p_location_id
          and earlier.ticket_number is null
          and (earlier.created_at, earlier.id) < (t.created_at, t.id))
   where t.location_id = p_location_id and t.ticket_number is null;

  -- Bring every order line onto its ticket, routed to the item's station.
  insert into kitchen_ticket_items(
    organization_id, location_id, ticket_id, order_item_id, station)
  select t.organization_id, t.location_id, t.id, oi.id, coalesce(nullif(mi.prep_station, ''), 'expo')
    from kitchen_tickets t
    join order_items oi on oi.order_id = t.order_id
    left join menu_items mi on mi.id = oi.menu_item_id
   where t.location_id = p_location_id
     and not exists (select 1 from kitchen_ticket_items kti where kti.ticket_id = t.id and kti.order_item_id = oi.id)
  on conflict (ticket_id, order_item_id) do nothing;

  select coalesce(jsonb_agg(jsonb_build_object(
      'ticketId', t.id,
      'orderId', t.order_id,
      'ticketNumber', t.ticket_number,
      'status', t.status,
      'createdAt', t.created_at,
      'serviceType', o.service_type,
      'tableId', o.table_id,
      'tableName', rt.name,
      'customerName', o.customer_name,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
            'ticketItemId', kti.id,
            'orderItemId', oi.id,
            'name', oi.name_snapshot,
            'quantity', oi.quantity,
            'station', kti.station,
            'status', kti.status,
            'selections', oi.selections_snapshot,
            'allergyNote', oi.allergy_note,
            'lineTotalMinor', oi.line_total_minor::text
          ) order by kti.created_at, oi.id)
          from kitchen_ticket_items kti
          join order_items oi on oi.id = kti.order_item_id
         where kti.ticket_id = t.id
      ), '[]'::jsonb)
    ) order by t.created_at)
  , '[]'::jsonb)
  into v_result
  from kitchen_tickets t
  join orders o on o.id = t.order_id
  left join restaurant_tables rt on rt.id = o.table_id
  where t.location_id = p_location_id
    and t.status in ('new','preparing','ready','recalled')
    and o.fulfillment_status not in ('cancelled','completed');

  -- Group the tickets by station so the board can be laid out in columns.
  select coalesce(jsonb_object_agg(
      s.station,
      jsonb_build_object(
        'station', s.station,
        'tickets', coalesce((
          select jsonb_agg(ticket order by ticket->>'createdAt')
            from jsonb_array_elements(v_result) as ticket
           where exists (
             select 1 from jsonb_array_elements(ticket->'items') as item
              where item->>'station' = s.station
           )
        ), '[]'::jsonb)
      )
    ), '{}'::jsonb)
  into v_result
  from (
    select distinct kti.station
      from kitchen_ticket_items kti
      join kitchen_tickets t on t.id = kti.ticket_id
     where t.location_id = p_location_id
       and t.status in ('new','preparing','ready','recalled')
  ) s;

  return jsonb_build_object('stations', v_result);
end $$;

-- ---------------------------------------------------------------------------
-- Per-line bumping.
--
-- A ticket is finished when every line on it is served. Serving a line is
-- what depletes the stock for that line, exactly once.
-- ---------------------------------------------------------------------------
create or replace function app_bump_ticket_item(p_ticket_item_id uuid, p_to_status text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item kitchen_ticket_items%rowtype;
  v_organization_id uuid; v_current text; v_allowed text[];
  v_ticket_status text; v_order_id uuid; v_depleted jsonb;
begin
  select * into v_item from kitchen_ticket_items where id = p_ticket_item_id for update;
  if not found then raise exception 'TICKET_ITEM_NOT_FOUND'; end if;

  v_organization_id := app_actor_scope(v_item.location_id, p_actor, array['owner','manager','kitchen','server']);

  v_current := v_item.status;
  if v_current = 'new' then v_allowed := array['holding','preparing'];
  elsif v_current = 'holding' then v_allowed := array['preparing'];
  elsif v_current = 'preparing' then v_allowed := array['ready'];
  elsif v_current = 'ready' then v_allowed := array['served'];
  else v_allowed := array[]::text[]; end if;

  -- Firing a held ticket releases it for preparation.
  if v_current = 'holding' and p_to_status = 'preparing' then v_allowed := array['preparing']; end if;
  if not (p_to_status = any(v_allowed)) then raise exception 'INVALID_TICKET_TRANSITION'; end if;

  update kitchen_ticket_items
     set status = p_to_status,
         fired_at = case when p_to_status = 'preparing' then now() else fired_at end,
         ready_at = case when p_to_status = 'ready' then now() else ready_at end,
         served_at = case when p_to_status = 'served' then now() else served_at end,
         updated_at = now()
   where id = p_ticket_item_id;

  -- Ticket state follows the lines: any preparing makes it preparing, every
  -- line ready makes it ready, every line served makes it served.
  select case
           when bool_and(kti.status = 'served') then 'served'
           when bool_and(kti.status in ('ready','served')) then 'ready'
           when bool_or(kti.status in ('preparing','ready')) then 'preparing'
           else 'new' end
    into v_ticket_status
    from kitchen_ticket_items kti where kti.ticket_id = v_item.ticket_id;

  update kitchen_tickets
     set status = v_ticket_status,
         ready_at = case when v_ticket_status = 'ready' then now() else ready_at end,
         served_at = case when v_ticket_status = 'served' then now() else served_at end,
         updated_at = now()
   where id = v_item.ticket_id;

  select order_id into v_order_id from kitchen_tickets where id = v_item.ticket_id;

  if v_ticket_status = 'served' then
    update orders set fulfillment_status = 'served' where id = v_order_id and fulfillment_status <> 'served';
  elsif v_ticket_status = 'ready' then
    update orders set fulfillment_status = 'ready' where id = v_order_id and fulfillment_status in ('received','preparing');
  elsif v_ticket_status = 'preparing' then
    update orders set fulfillment_status = 'preparing' where id = v_order_id and fulfillment_status = 'received';
  end if;

  if p_to_status = 'served' then
    v_depleted := app_deplete_stock_for_order_item(v_item.order_item_id, p_actor);
  else
    v_depleted := jsonb_build_object('depleted', false);
  end if;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, p_actor, 'ticket.item_bumped', 'kitchen_ticket_item', p_ticket_item_id::text,
      jsonb_build_object('from', v_current, 'to', p_to_status, 'ticketStatus', v_ticket_status));

  return jsonb_build_object(
    'ticketItemId', p_ticket_item_id,
    'status', p_to_status,
    'ticketStatus', v_ticket_status,
    'orderId', v_order_id,
    'stock', v_depleted);
end $$;

-- ---------------------------------------------------------------------------
-- Stock depletion.
--
-- Depleting a sold line writes one movement per recipe line. The movement
-- event id is derived from the order line, so serving the same line twice
-- cannot double the depletion.
-- ---------------------------------------------------------------------------
create or replace function app_deplete_stock_for_order_item(p_order_item_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item order_items%rowtype;
  v_order record;
  v_organization_id uuid; v_recipe record; v_movement uuid; v_count integer := 0;
begin
  select * into v_item from order_items where id = p_order_item_id;
  if not found then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;

  select o.id, o.organization_id, o.location_id into v_order
    from orders o where o.id = v_item.order_id;

  v_organization_id := app_actor_scope(v_order.location_id, p_actor, array['owner','manager','kitchen','server']);

  for v_recipe in
    select id, ingredient_id, quantity_milli_units, waste_percent
      from menu_item_ingredients where menu_item_id = v_item.menu_item_id
  loop
    insert into stock_movements(
      organization_id, location_id, ingredient_id, event_id, kind, quantity_milli_units, source_order_id, actor_id)
    values (
      v_order.organization_id, v_order.location_id, v_recipe.ingredient_id,
      'deplete:' || v_order.id::text || ':' || v_item.id::text || ':' || v_recipe.ingredient_id::text,
      'depletion',
      -((v_recipe.quantity_milli_units * v_item.quantity * (100 + v_recipe.waste_percent) + 50) / 100),
      v_order.id, p_actor)
    on conflict (event_id) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  return jsonb_build_object('depleted', v_count > 0, 'movements', v_count);
end $$;

-- ---------------------------------------------------------------------------
-- Stock position.
-- ---------------------------------------------------------------------------
create or replace function app_inventory_position(p_location_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid;
begin
  v_organization_id := app_actor_scope(p_location_id, p_actor, array['owner','manager','kitchen','accountant']);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'ingredientId', i.id,
        'name', i.name,
        'baseUnit', i.base_unit,
        'onHandMilliUnits', coalesce(m.on_hand, 0)::text,
        'reorderLevelMilliUnits', i.reorder_level_milli_units::text,
        'unitCostMinor', i.unit_cost_minor::text,
        'lowStock', coalesce(m.on_hand, 0) <= i.reorder_level_milli_units,
        'lastMovementAt', m.last_movement_at
      ) order by i.name)
    from ingredients i
    left join lateral (
      select sum(sm.quantity_milli_units) as on_hand, max(sm.created_at) as last_movement_at
        from stock_movements sm where sm.ingredient_id = i.id
    ) m on true
    where i.location_id = p_location_id
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Day end report.
--
-- Everything is computed from the orders themselves, grouped by currency so a
-- total is never a sum of two currencies.
-- ---------------------------------------------------------------------------
create or replace function app_day_end_report(p_location_id uuid, p_from timestamptz, p_to timestamptz, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_currency text; v_requires jsonb; v_totals jsonb; v_hourly jsonb; v_channels jsonb; v_service jsonb;
begin
  v_organization_id := app_actor_scope(p_location_id, p_actor, array['owner','manager','accountant']);
  select currency into v_currency from locations where id = p_location_id;

  select jsonb_build_object(
      'orderCount', count(*),
      'covers', count(*),
      'grossSubtotalMinor', coalesce(sum(subtotal_minor), 0)::text,
      'discountMinor', coalesce(sum(discount_minor), 0)::text,
      'taxMinor', coalesce(sum(tax_minor), 0)::text,
      'tipMinor', coalesce(sum(tip_minor), 0)::text,
      'netTotalMinor', coalesce(sum(total_minor - discount_minor), 0)::text,
      'cancelledCount', count(*) filter (where fulfillment_status = 'cancelled')::text,
      'cancelledMinor', coalesce(sum(total_minor) filter (where fulfillment_status = 'cancelled'), 0)::text
    )
  into v_totals
  from orders
  where location_id = p_location_id and created_at >= p_from and created_at < p_to;

  select jsonb_agg(jsonb_build_object('hour', h.hour, 'orderCount', h.cnt, 'netTotalMinor', h.total::text) order by h.hour)
  into v_hourly
  from (
    select extract(hour from created_at)::integer as hour, count(*) as cnt,
           sum(total_minor - discount_minor) as total
      from orders
     where location_id = p_location_id and created_at >= p_from and created_at < p_to
       and fulfillment_status <> 'cancelled'
     group by 1
  ) h;

  select jsonb_agg(jsonb_build_object('channel', c.source_channel, 'orderCount', c.cnt, 'netTotalMinor', c.total::text) order by c.source_channel)
  into v_channels
  from (
    select source_channel, count(*) as cnt, sum(total_minor - discount_minor) as total
      from orders
     where location_id = p_location_id and created_at >= p_from and created_at < p_to
     group by 1
  ) c;

  select jsonb_agg(jsonb_build_object('serviceType', s.service_type, 'orderCount', s.cnt, 'netTotalMinor', s.total::text) order by s.service_type)
  into v_service
  from (
    select service_type, count(*) as cnt, sum(total_minor - discount_minor) as total
      from orders
     where location_id = p_location_id and created_at >= p_from and created_at < p_to
     group by 1
  ) s;

  -- Voids and discounts are the two levers a manager watches for misuse.
  select jsonb_build_object(
      'discountOrderCount', count(*) filter (where discount_minor > 0),
      'discountMinor', coalesce(sum(discount_minor), 0)::text,
      'largestDiscountMinor', coalesce(max(discount_minor), 0)::text,
      'fullyDiscountedCount', count(*) filter (where discount_minor >= subtotal_minor and subtotal_minor > 0),
      'cancelledOrderCount', count(*) filter (where fulfillment_status = 'cancelled')
    )
  into v_requires
  from orders
  where location_id = p_location_id and created_at >= p_from and created_at < p_to;

  return jsonb_build_object(
    'locationId', p_location_id,
    'currency', v_currency,
    'from', p_from,
    'to', p_to,
    'totals', v_totals,
    'hourly', coalesce(v_hourly, '[]'::jsonb),
    'channels', coalesce(v_channels, '[]'::jsonb),
    'serviceTypes', coalesce(v_service, '[]'::jsonb),
    'exceptions', v_requires
  );
end $$;

-- ---------------------------------------------------------------------------
-- Grants.
-- ---------------------------------------------------------------------------
grant execute on function app_actor_scope(uuid, uuid, text[]) to authenticated;
grant execute on function app_upsert_station(uuid, text, text, integer, uuid) to authenticated;
grant execute on function app_set_recipe_item(uuid, uuid, uuid, bigint, integer, uuid) to authenticated;
grant execute on function app_set_prep_station(uuid, uuid, text, uuid) to authenticated;
grant execute on function app_record_stock_receipt(uuid, uuid, bigint, text, uuid) to authenticated;
grant execute on function app_kitchen_board(uuid, uuid) to authenticated;
grant execute on function app_bump_ticket_item(uuid, text, uuid) to authenticated;
grant execute on function app_deplete_stock_for_order_item(uuid, uuid) to authenticated;
grant execute on function app_inventory_position(uuid, uuid) to authenticated;
grant execute on function app_day_end_report(uuid, timestamptz, timestamptz, uuid) to authenticated;

revoke all on function app_actor_scope(uuid, uuid, text[]) from public;
revoke all on function app_upsert_station(uuid, text, text, integer, uuid) from public;
revoke all on function app_set_recipe_item(uuid, uuid, uuid, bigint, integer, uuid) from public;
revoke all on function app_set_prep_station(uuid, uuid, text, uuid) from public;
revoke all on function app_record_stock_receipt(uuid, uuid, bigint, text, uuid) from public;
revoke all on function app_kitchen_board(uuid, uuid) from public;
revoke all on function app_bump_ticket_item(uuid, text, uuid) from public;
revoke all on function app_deplete_stock_for_order_item(uuid, uuid) from public;
revoke all on function app_inventory_position(uuid, uuid) from public;
revoke all on function app_day_end_report(uuid, timestamptz, timestamptz, uuid) from public;

-- ---------------------------------------------------------------------------
-- Staff order with a table, a guest and per-line routing.
--
-- Replaces the earlier version so a counter order records the table it was
-- taken at, carries any allergy or kitchen note onto the line, and lands every
-- line on the kitchen ticket already routed to its station.
-- ---------------------------------------------------------------------------
create or replace function app_create_staff_order(
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
  v_priced jsonb; v_lines jsonb; v_line jsonb; v_input jsonb;
  v_subtotal bigint; v_tax bigint; v_total bigint;
  v_tax_basis_points integer; v_tax_inclusive boolean;
  v_paid boolean := false;
  v_order_item_id uuid; v_station text; v_index integer := 0; v_ticket_number bigint;
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

  if p_table_id is not null and not exists (
    select 1 from restaurant_tables where id = p_table_id and location_id = p_location_id
  ) then raise exception 'TABLE_NOT_FOUND'; end if;

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
    subtotal_minor, tax_minor, total_minor, source_channel, tender_type, payment_provider, payment_status,
    table_id, customer_name, scheduled_for
  ) values (
    v_organization_id, p_location_id, v_tracking, p_service_type, p_customer_locale, v_currency,
    v_subtotal, v_tax, v_total, 'pos', p_tender_type,
    case when p_tender_type = 'cash' then 'cash' else 'counter' end,
    case when v_paid then 'paid' else 'unpaid' end,
    p_table_id, nullif(btrim(coalesce(p_customer_name, '')), ''), p_scheduled_for
  ) returning id into v_order_id;

  -- Ticket numbers are counted per location. The location row is locked so two
  -- counters taking an order at the same moment cannot claim the same number.
  perform 1 from locations where id = p_location_id for update;
  select coalesce(max(ticket_number), 0) + 1 into v_ticket_number
    from kitchen_tickets where location_id = p_location_id;

  insert into kitchen_tickets(organization_id, location_id, order_id, ticket_number)
    values (v_organization_id, p_location_id, v_order_id, v_ticket_number)
    on conflict(order_id) do nothing
    returning id into v_ticket_id;
  if v_ticket_id is null then
    select id into v_ticket_id from kitchen_tickets where order_id = v_order_id;
  end if;

  v_index := 0;
  for v_line in select value from jsonb_array_elements(v_lines) loop
    v_index := v_index + 1;
    select value into v_input from jsonb_array_elements(p_items) with ordinality as t(value, ord) where t.ord = v_index;

    insert into order_items(
      order_id, menu_item_id, name_snapshot, description_snapshot, selections_snapshot,
      quantity, unit_price_minor, line_total_minor, currency, allergy_note, kitchen_note
    ) values (
      v_order_id, (v_line->>'menuItemId')::uuid, v_line->>'name', coalesce(v_line->>'description', ''),
      coalesce(v_line->'selections', '[]'::jsonb),
      (v_line->>'quantity')::integer, (v_line->>'unitPriceMinor')::bigint,
      ((v_line->>'unitPriceMinor')::bigint * (v_line->>'quantity')::integer), v_currency,
      nullif(btrim(coalesce(v_input->>'allergyNote', '')), ''),
      nullif(btrim(coalesce(v_input->>'kitchenNote', '')), '')
    ) returning id into v_order_item_id;

    select coalesce(nullif(mi.prep_station, ''), 'expo') into v_station
      from menu_items mi where mi.id = (v_line->>'menuItemId')::uuid;

    insert into kitchen_ticket_items(organization_id, location_id, ticket_id, order_item_id, station)
      values (v_organization_id, p_location_id, v_ticket_id, v_order_item_id, coalesce(v_station, 'expo'))
      on conflict (ticket_id, order_item_id) do nothing;
  end loop;

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
    'orderId', v_order_id, 'ticketId', v_ticket_id, 'ticketNumber', v_ticket_number, 'currency', v_currency,
    'subtotalMinor', v_subtotal::text, 'taxMinor', v_tax::text, 'totalMinor', v_total::text,
    'paymentStatus', case when v_paid then 'paid' else 'unpaid' end);
end $$;

grant execute on function app_create_staff_order(uuid, text, text, jsonb, uuid, text, uuid, text, timestamptz) to authenticated;
revoke all on function app_create_staff_order(uuid, text, text, jsonb, uuid, text, uuid, text, timestamptz) from public;

-- ---------------------------------------------------------------------------
-- Inventory configuration.
--
-- An ingredient is a thing the kitchen buys; a recipe says what one menu item
-- consumes of it.
-- ---------------------------------------------------------------------------
create or replace function app_upsert_ingredient(
  p_location_id uuid, p_name text, p_base_unit text,
  p_reorder_level_milli_units bigint, p_unit_cost_minor bigint, p_actor uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_id uuid;
begin
  v_organization_id := app_actor_scope(p_location_id, p_actor, array['owner','manager']);
  if p_name is null or btrim(p_name) = '' then raise exception 'INVALID_REQUEST'; end if;
  if p_base_unit is null or btrim(p_base_unit) = '' then raise exception 'INVALID_REQUEST'; end if;

  insert into ingredients(organization_id, location_id, name, base_unit, reorder_level_milli_units, unit_cost_minor)
    values (v_organization_id, p_location_id, btrim(p_name), btrim(p_base_unit),
            coalesce(p_reorder_level_milli_units, 0), coalesce(p_unit_cost_minor, 0))
    on conflict (location_id, name) do update
      set base_unit = excluded.base_unit,
          reorder_level_milli_units = excluded.reorder_level_milli_units,
          unit_cost_minor = excluded.unit_cost_minor
    returning id into v_id;

  return jsonb_build_object('ingredientId', v_id, 'name', btrim(p_name));
end $$;

create or replace function app_list_inventory_config(p_location_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_ingredients jsonb; v_recipes jsonb; v_stations jsonb; v_tickets jsonb;
begin
  v_organization_id := app_actor_scope(p_location_id, p_actor, array['owner','manager','kitchen','accountant']);

  select coalesce(jsonb_agg(jsonb_build_object(
      'ingredientId', i.id, 'name', i.name, 'baseUnit', i.base_unit,
      'reorderLevelMilliUnits', i.reorder_level_milli_units::text,
      'unitCostMinor', i.unit_cost_minor::text) order by i.name), '[]'::jsonb)
    into v_ingredients
    from ingredients i where i.location_id = p_location_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'menuItemId', mii.menu_item_id, 'menuItemName', mi.name,
      'ingredientId', mii.ingredient_id, 'ingredientName', ing.name,
      'quantityMilliUnits', mii.quantity_milli_units::text,
      'wastePercent', mii.waste_percent) order by mi.name, ing.name), '[]'::jsonb)
    into v_recipes
    from menu_item_ingredients mii
    join menu_items mi on mi.id = mii.menu_item_id
    join ingredients ing on ing.id = mii.ingredient_id
    where mii.location_id = p_location_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'stationId', s.id, 'name', s.name, 'color', s.color, 'sortOrder', s.sort_order) order by s.sort_order, s.name), '[]'::jsonb)
    into v_stations
    from kitchen_stations s where s.location_id = p_location_id and s.active;

  -- The menu items a recipe can be attached to, with the station each is
  -- prepared at.
  select coalesce(jsonb_agg(jsonb_build_object(
      'menuItemId', mi.id, 'name', mi.name, 'category', cc.name,
      'prepStation', mi.prep_station, 'available', mi.available) order by cc.name, mi.name), '[]'::jsonb)
    into v_tickets
    from menu_items mi
    join catalog_categories cc on cc.id = mi.category_id
    where mi.location_id = p_location_id;

  return jsonb_build_object(
    'ingredients', v_ingredients,
    'recipes', v_recipes,
    'stations', v_stations,
    'menuItems', v_tickets);
end $$;

grant execute on function app_upsert_ingredient(uuid, text, text, bigint, bigint, uuid) to authenticated;
grant execute on function app_list_inventory_config(uuid, uuid) to authenticated;
revoke all on function app_upsert_ingredient(uuid, text, text, bigint, bigint, uuid) from public;
revoke all on function app_list_inventory_config(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- The locations a member belongs to.
--
-- A member may work at more than one location, so the staff surfaces let them
-- choose which one they are standing in.
-- ---------------------------------------------------------------------------
create or replace function app_my_locations(p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'locationId', l.id,
        'organizationId', l.organization_id,
        'name', l.name,
        'address', l.address,
        'currency', l.currency,
        'timezone', l.timezone,
        'role', m.role,
        'orderingEnabled', l.ordering_enabled
      ) order by o.name, l.name)
    from memberships m
    join locations l on l.organization_id = m.organization_id
    join organizations o on o.id = m.organization_id
    where m.user_id = p_actor
  ), '[]'::jsonb);
end $$;

grant execute on function app_my_locations(uuid) to authenticated;
revoke all on function app_my_locations(uuid) from public;

-- ---------------------------------------------------------------------------
-- The reporting window.
--
-- Without an explicit window the report covers the location's own trading
-- day, computed in the timezone the location declares.
-- ---------------------------------------------------------------------------
create or replace function app_day_end_window(p_location_id uuid, p_from timestamptz, p_to timestamptz, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_timezone text; v_from timestamptz; v_to timestamptz;
begin
  v_organization_id := app_actor_scope(p_location_id, p_actor, array['owner','manager','accountant']);
  select timezone into v_timezone from locations where id = p_location_id;

  if p_from is null then
    v_from := (date_trunc('day', now() at time zone v_timezone)) at time zone v_timezone;
  else
    v_from := p_from;
  end if;
  if p_to is null then v_to := now(); else v_to := p_to; end if;

  return jsonb_build_object('from', v_from, 'to', v_to, 'timezone', v_timezone);
end $$;

grant execute on function app_day_end_window(uuid, timestamptz, timestamptz, uuid) to authenticated;
revoke all on function app_day_end_window(uuid, timestamptz, timestamptz, uuid) from public;

commit;
