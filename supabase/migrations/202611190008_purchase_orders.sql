begin;

-- ---------------------------------------------------------------------------
-- Purchase orders.
--
-- Stock already leaves correctly when a dish is served, and a delivery note can
-- be recorded against an ingredient. What a restaurant also does every morning is
-- order from suppliers: write down what is coming, then receive it and let the
-- stock arrive with it. Without that, the inventory knows what went out and never
-- knows what was bought in, so a stock figure can only be trusted for a day.
--
-- A purchase order is deliberately not an accounting document: it carries what
-- was ordered, at what cost, and how much of it actually arrived.
-- ---------------------------------------------------------------------------

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  supplier text not null check (length(btrim(supplier)) between 1 and 120),
  reference text check (reference is null or length(btrim(reference)) <= 60),
  status text not null default 'draft' check (status in ('draft', 'ordered', 'received', 'cancelled')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  ordered_at timestamptz,
  received_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict
);

create table if not exists purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  quantity_milli_units bigint not null check (quantity_milli_units > 0),
  unit_cost_minor bigint not null default 0 check (unit_cost_minor >= 0),
  received_milli_units bigint not null default 0 check (received_milli_units >= 0),
  unique (purchase_order_id, ingredient_id)
);

alter table purchase_orders enable row level security;
alter table purchase_order_lines enable row level security;

create policy purchase_orders_member_read on purchase_orders
  for select to authenticated using (is_organization_member(organization_id));
create policy purchase_orders_manager_write on purchase_orders
  for all to authenticated
  using (is_organization_manager(organization_id))
  with check (is_organization_manager(organization_id));

create policy purchase_order_lines_member_read on purchase_order_lines
  for select to authenticated using (
    exists (select 1 from purchase_orders po where po.id = purchase_order_id and is_organization_member(po.organization_id)));
create policy purchase_order_lines_manager_write on purchase_order_lines
  for all to authenticated
  using (
    exists (select 1 from purchase_orders po where po.id = purchase_order_id and is_organization_manager(po.organization_id)))
  with check (
    exists (select 1 from purchase_orders po where po.id = purchase_order_id and is_organization_manager(po.organization_id)));

create index if not exists purchase_orders_location_created_idx
  on purchase_orders(location_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The order book.
-- ---------------------------------------------------------------------------

create or replace function app_purchase_orders(p_location_id uuid, p_actor uuid, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid; v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_member(v_organization_id) then raise exception 'FORBIDDEN'; end if;

  return coalesce((
    select jsonb_agg(row_to_json(orders)) from (
      select po.id as "purchaseOrderId",
             po.supplier,
             po.reference,
             po.status,
             po.currency,
             po.created_at as "createdAt",
             po.status = 'received' as "received",
             (select coalesce(sum(l.quantity_milli_units), 0)::text from purchase_order_lines l where l.purchase_order_id = po.id) as "quantityMilliUnits",
             (select (coalesce(sum(l.quantity_milli_units * l.unit_cost_minor), 0) / 1000)::bigint::text from purchase_order_lines l where l.purchase_order_id = po.id) as "totalMinor",
             (select coalesce(sum(l.received_milli_units), 0)::text from purchase_order_lines l where l.purchase_order_id = po.id) as "receivedMilliUnits"
        from purchase_orders po
       where po.location_id = p_location_id
       order by po.created_at desc
       limit v_limit) orders), '[]'::jsonb);
end $$;

create or replace function app_create_purchase_order(
  p_location_id uuid, p_actor uuid, p_supplier text, p_reference text, p_lines jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid;
  v_currency text;
  v_order_id uuid;
  v_line jsonb;
  v_ingredient_id uuid;
  v_quantity bigint;
  v_cost bigint;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id, currency into v_organization_id, v_currency from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  if p_supplier is null or btrim(p_supplier) = '' then raise exception 'INVALID_REQUEST'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'INVALID_REQUEST'; end if;

  insert into purchase_orders(organization_id, location_id, supplier, reference, status, currency, ordered_at, created_by)
    values (v_organization_id, p_location_id, btrim(p_supplier),
            nullif(btrim(coalesce(p_reference, '')), ''), 'ordered', v_currency, now(), p_actor)
    returning id into v_order_id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_ingredient_id := (v_line ->> 'ingredientId')::uuid;
    v_quantity := (v_line ->> 'quantityMilliUnits')::bigint;
    v_cost := coalesce((v_line ->> 'unitCostMinor')::bigint, 0);
    if v_quantity is null or v_quantity <= 0 or v_cost < 0 then raise exception 'INVALID_REQUEST'; end if;
    if not exists (select 1 from ingredients where id = v_ingredient_id and location_id = p_location_id) then
      raise exception 'INGREDIENT_NOT_FOUND';
    end if;
    insert into purchase_order_lines(purchase_order_id, ingredient_id, quantity_milli_units, unit_cost_minor)
      values (v_order_id, v_ingredient_id, v_quantity, v_cost)
      on conflict (purchase_order_id, ingredient_id)
      do update set quantity_milli_units = purchase_order_lines.quantity_milli_units + excluded.quantity_milli_units;
  end loop;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, p_actor, 'purchase_order.created', 'purchase_order', v_order_id::text,
            jsonb_build_object('supplier', btrim(p_supplier), 'lines', jsonb_array_length(p_lines)));

  return jsonb_build_object('purchaseOrderId', v_order_id, 'status', 'ordered',
    'currency', v_currency,
    'totalMinor', (select (coalesce(sum(quantity_milli_units * unit_cost_minor), 0) / 1000)::bigint::text
                     from purchase_order_lines where purchase_order_id = v_order_id));
end $$;

-- Receiving a purchase order is what moves stock. Each line writes one receipt
-- movement with a stable event id, so receiving the same order twice — an
-- impatient click, a retried request — cannot double the stock.
create or replace function app_receive_purchase_order(p_purchase_order_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order purchase_orders;
  v_line purchase_order_lines;
  v_event_key text;
  v_movements integer := 0;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select * into v_order from purchase_orders where id = p_purchase_order_id for update;
  if not found then raise exception 'PURCHASE_ORDER_NOT_FOUND'; end if;
  if not is_organization_manager(v_order.organization_id) then raise exception 'FORBIDDEN'; end if;
  if v_order.status = 'cancelled' then raise exception 'PURCHASE_ORDER_CANCELLED'; end if;
  if v_order.status = 'received' then
    return jsonb_build_object('purchaseOrderId', v_order.id, 'status', 'received', 'alreadyReceived', true, 'movements', 0);
  end if;

  for v_line in select * from purchase_order_lines where purchase_order_id = v_order.id loop
    v_event_key := 'receipt:' || v_order.location_id::text || ':po:' || v_order.id::text || ':' || v_line.id::text;
    insert into stock_movements(
      organization_id, location_id, ingredient_id, event_id, kind, quantity_milli_units, actor_id)
      values (v_order.organization_id, v_order.location_id, v_line.ingredient_id, v_event_key, 'receipt',
              v_line.quantity_milli_units, p_actor)
      on conflict (event_id) do nothing;
    if found then v_movements := v_movements + 1; end if;
    update purchase_order_lines set received_milli_units = quantity_milli_units where id = v_line.id;
  end loop;

  update purchase_orders set status = 'received', received_at = now() where id = v_order.id;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_order.organization_id, p_actor, 'purchase_order.received', 'purchase_order', v_order.id::text,
            jsonb_build_object('movements', v_movements));

  return jsonb_build_object('purchaseOrderId', v_order.id, 'status', 'received',
    'alreadyReceived', false, 'movements', v_movements);
end $$;

create or replace function app_cancel_purchase_order(p_purchase_order_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order purchase_orders;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select * into v_order from purchase_orders where id = p_purchase_order_id for update;
  if not found then raise exception 'PURCHASE_ORDER_NOT_FOUND'; end if;
  if not is_organization_manager(v_order.organization_id) then raise exception 'FORBIDDEN'; end if;
  if v_order.status = 'received' then raise exception 'PURCHASE_ORDER_ALREADY_RECEIVED'; end if;
  update purchase_orders set status = 'cancelled' where id = v_order.id;
  return jsonb_build_object('purchaseOrderId', v_order.id, 'status', 'cancelled');
end $$;

revoke all on function app_purchase_orders(uuid, uuid, integer) from public;
revoke all on function app_create_purchase_order(uuid, uuid, text, text, jsonb) from public;
revoke all on function app_receive_purchase_order(uuid, uuid) from public;
revoke all on function app_cancel_purchase_order(uuid, uuid) from public;

grant execute on function app_purchase_orders(uuid, uuid, integer) to authenticated;
grant execute on function app_create_purchase_order(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function app_receive_purchase_order(uuid, uuid) to authenticated;
grant execute on function app_cancel_purchase_order(uuid, uuid) to authenticated;

commit;