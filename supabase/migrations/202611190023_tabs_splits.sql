begin;

-- ---------------------------------------------------------------------------
-- Bar tabs and bill splits.
--
-- A tab is an unpaid staff order that grows: items are added as the guest
-- orders again, and the bill is settled at the end, possibly across several
-- payments. A split moves chosen items of an open order onto a new order so
-- each party pays their own.
--
-- Every recorded payment is a ledger row keyed by a client event id, so a
-- retried request cannot take the same money twice, and an order is marked
-- paid exactly when the payments cover it.
-- ---------------------------------------------------------------------------

create table order_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null,
  order_id uuid not null references orders(id) on delete restrict,
  event_id text not null unique,
  tender text not null check (tender in ('cash','counter','external_terminal')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  paid_by uuid, created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict
);
create index order_payments_order on order_payments(order_id);

alter table order_payments enable row level security;
create policy order_payments_member_read on order_payments
  for select to authenticated using (is_organization_member(organization_id));

-- Adds items to an open tab. The order is re-priced from the published price
-- book — never from the client — and the new items join the kitchen ticket.
create or replace function app_add_order_items(p_actor uuid, p_order_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_location_id uuid; v_currency text; v_settings jsonb;
  v_priced jsonb; v_line jsonb; v_input jsonb;
  v_added bigint; v_tax bigint; v_total bigint;
  v_fulfillment text; v_payment text; v_channel text;
  v_tax_basis_points integer; v_tax_inclusive boolean;
  v_ticket_id uuid; v_order_item_id uuid; v_station text; v_index integer := 0;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'INVALID_REQUEST'; end if;

  select organization_id, location_id, currency into v_organization_id, v_location_id, v_currency
    from orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not exists (
    select 1 from memberships
    where organization_id = v_organization_id and user_id = p_actor
      and role in ('owner','manager','host','server','kitchen')
  ) then raise exception 'FORBIDDEN'; end if;

  select fulfillment_status, payment_status, source_channel
    into v_fulfillment, v_payment, v_channel
    from orders where id = p_order_id;
  if v_fulfillment not in ('received','preparing') then raise exception 'ORDER_NOT_OPEN'; end if;
  if v_payment <> 'unpaid' then raise exception 'ORDER_ALREADY_PAID'; end if;
  if v_channel = 'storefront' then raise exception 'ORDER_NOT_OPEN'; end if;

  select currency, service_settings into v_currency, v_settings
    from locations where id = v_location_id;

  v_priced := app_price_order_lines(v_location_id, v_organization_id, v_currency, p_items);
  v_added := (v_priced->>'subtotalMinor')::bigint;

  select id into v_ticket_id from kitchen_tickets where order_id = p_order_id;

  v_index := 0;
  for v_line in select value from jsonb_array_elements(v_priced->'lines') loop
    v_index := v_index + 1;
    select value into v_input from jsonb_array_elements(p_items) with ordinality as t(value, ord) where t.ord = v_index;

    insert into order_items(
      order_id, menu_item_id, name_snapshot, description_snapshot, selections_snapshot,
      quantity, unit_price_minor, line_total_minor, currency, allergy_note, kitchen_note
    ) values (
      p_order_id, (v_line->>'menuItemId')::uuid, v_line->>'name', coalesce(v_line->>'description', ''),
      coalesce(v_line->'selections', '[]'::jsonb),
      (v_line->>'quantity')::integer, (v_line->>'unitPriceMinor')::bigint,
      ((v_line->>'unitPriceMinor')::bigint * (v_line->>'quantity')::integer), v_currency,
      nullif(btrim(coalesce(v_input->>'allergyNote', '')), ''),
      nullif(btrim(coalesce(v_input->>'kitchenNote', '')), '')
    ) returning id into v_order_item_id;

    select coalesce(nullif(mi.prep_station, ''), 'expo') into v_station
      from menu_items mi where mi.id = (v_line->>'menuItemId')::uuid;

    if v_ticket_id is not null then
      insert into kitchen_ticket_items(organization_id, location_id, ticket_id, order_item_id, station)
        values (v_organization_id, v_location_id, v_ticket_id, v_order_item_id, coalesce(v_station, 'expo'))
        on conflict (ticket_id, order_item_id) do nothing;
    end if;
  end loop;

  -- The same pricing rules as when the order was taken, applied to the whole
  -- tab, so the totals never disagree with a fresh recalculation.
  update orders o
     set subtotal_minor = o.subtotal_minor + v_added,
         tax_minor = case
           when coalesce((v_settings->>'pricingMode') = 'tax_inclusive', false)
             then ((o.subtotal_minor + v_added) - ((o.subtotal_minor + v_added) * 10000 / (10000 + coalesce((v_settings->>'taxBasisPoints')::integer, 0))))
           else ((o.subtotal_minor + v_added) * coalesce((v_settings->>'taxBasisPoints')::integer, 0) + 5000) / 10000 end,
         total_minor = case
           when coalesce((v_settings->>'pricingMode') = 'tax_inclusive', false)
             then (o.subtotal_minor + v_added) - ((o.subtotal_minor + v_added) * 10000 / (10000 + coalesce((v_settings->>'taxBasisPoints')::integer, 0)))
           else (o.subtotal_minor + v_added) + (((o.subtotal_minor + v_added) * coalesce((v_settings->>'taxBasisPoints')::integer, 0) + 5000) / 10000) end
   where o.id = p_order_id
   returning o.tax_minor, o.total_minor into v_tax, v_total;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, p_actor, 'order.items_added', 'order', p_order_id::text,
      jsonb_build_object('addedMinor', v_added::text, 'totalMinor', v_total::text));

  return jsonb_build_object('orderId', p_order_id, 'addedMinor', v_added::text,
    'subtotalMinor', (select subtotal_minor::text from orders where id = p_order_id),
    'taxMinor', v_tax::text, 'totalMinor', v_total::text);
end $$;

-- Records one payment against an open bill. Partial payments are the split
-- bill; the last one closes it. The order is marked paid only when the
-- payments cover the total, and the kitchen ticket appears exactly then for
-- orders that did not already have one.
create or replace function app_record_order_payment(
  p_actor uuid, p_order_id uuid, p_amount_minor bigint, p_tender text, p_event_id text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_location_id uuid; v_currency text;
  v_total bigint; v_status text; v_fulfillment text; v_channel text;
  v_paid_total bigint; v_now_paid boolean := false;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception 'INVALID_REQUEST'; end if;
  if p_tender !~ '^(cash|counter|external_terminal)$' then raise exception 'INVALID_REQUEST'; end if;

  select organization_id, location_id, currency, total_minor, payment_status, fulfillment_status, source_channel
    into v_organization_id, v_location_id, v_currency, v_total, v_status, v_fulfillment, v_channel
    from orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not exists (
    select 1 from memberships
    where organization_id = v_organization_id and user_id = p_actor
      and role in ('owner','manager','host','server')
  ) then raise exception 'FORBIDDEN'; end if;
  if v_fulfillment = 'cancelled' then raise exception 'ORDER_ALREADY_VOIDED'; end if;
  if v_status <> 'unpaid' then raise exception 'ORDER_ALREADY_PAID'; end if;

  insert into order_payments(organization_id, location_id, order_id, event_id, tender, amount_minor, currency, paid_by)
    values (v_organization_id, v_location_id, p_order_id,
      coalesce(p_event_id, 'payment:' || replace(gen_random_uuid()::text, '-', '')),
      p_tender, p_amount_minor, v_currency, p_actor);

  select coalesce(sum(amount_minor), 0) into v_paid_total from order_payments where order_id = p_order_id;
  v_now_paid := v_paid_total >= v_total;

  if v_now_paid then
    update orders
       set payment_status = 'paid', tender_type = p_tender, payment_provider = p_tender
     where id = p_order_id;
    insert into kitchen_tickets(organization_id, location_id, order_id)
      values (v_organization_id, v_location_id, p_order_id) on conflict (order_id) do nothing;
    insert into outbox_events(organization_id, event_key, event_type, payload)
      values (v_organization_id, 'order.paid:' || p_order_id::text, 'order.paid',
        jsonb_build_object('orderId', p_order_id, 'channel', v_channel))
      on conflict (event_key) do nothing;
  end if;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, p_actor, 'order.payment_recorded', 'order', p_order_id::text,
      jsonb_build_object('amountMinor', p_amount_minor::text, 'tender', p_tender,
        'paidTotalMinor', v_paid_total::text, 'totalMinor', v_total::text, 'closed', v_now_paid));

  return jsonb_build_object('orderId', p_order_id, 'paidTotalMinor', v_paid_total::text,
    'totalMinor', v_total::text, 'paymentStatus', case when v_now_paid then 'paid' else 'unpaid' end);
end $$;

-- Splits chosen items of an open order onto a new order. Items move with
-- their prices; the original's totals are reduced by exactly what left; the
-- kitchen ticket items follow the food. At least one item must remain.
create or replace function app_split_order(p_actor uuid, p_order_id uuid, p_order_item_ids jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_location_id uuid; v_currency text;
  v_order orders%rowtype; v_settings jsonb;
  v_item order_items%rowtype;
  v_moved bigint := 0; v_moved_count integer := 0;
  v_new_order_id uuid; v_new_ticket_id uuid; v_ticket_number bigint;
  v_ticket_item kitchen_ticket_items%rowtype;
  v_remaining integer;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_order_item_ids) <> 'array' or jsonb_array_length(p_order_item_ids) = 0 then
    raise exception 'INVALID_REQUEST';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  v_organization_id := v_order.organization_id; v_location_id := v_order.location_id; v_currency := v_order.currency;
  if not exists (
    select 1 from memberships
    where organization_id = v_organization_id and user_id = p_actor
      and role in ('owner','manager','host','server')
  ) then raise exception 'FORBIDDEN'; end if;
  if v_order.fulfillment_status not in ('received','preparing') then raise exception 'ORDER_NOT_OPEN'; end if;
  if v_order.payment_status <> 'unpaid' then raise exception 'ORDER_ALREADY_PAID'; end if;
  if v_order.source_channel = 'storefront' then raise exception 'ORDER_NOT_OPEN'; end if;

  select currency, service_settings into v_currency, v_settings
    from locations where id = v_location_id;

  -- Validate every id first: the split is all-or-nothing.
  for v_item in select oi.* from order_items oi
      where oi.order_id = p_order_id
        and oi.id = any (select (value #>> '{}')::uuid from jsonb_array_elements(p_order_item_ids))
      order by oi.id
  loop
    v_moved := v_moved + v_item.line_total_minor;
    v_moved_count := v_moved_count + 1;
  end loop;
  if v_moved_count <> jsonb_array_length(p_order_item_ids) then raise exception 'ITEM_NOT_ON_ORDER'; end if;
  if v_moved >= v_order.subtotal_minor then raise exception 'SPLIT_MUST_LEAVE_ITEMS'; end if;

  -- The new order and its ticket claim the next number, under the same lock
  -- the original ticket took.
  perform 1 from locations where id = v_location_id for update;
  insert into orders(
    organization_id, location_id, tracking_token, service_type, customer_locale, currency,
    subtotal_minor, tax_minor, total_minor, source_channel, payment_status, table_id, customer_name, created_by
  ) values (
    v_organization_id, v_location_id, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    v_order.service_type, v_order.customer_locale, v_currency,
    v_moved,
    case when coalesce((v_settings->>'pricingMode') = 'tax_inclusive', false)
      then v_moved - (v_moved * 10000 / (10000 + coalesce((v_settings->>'taxBasisPoints')::integer, 0)))
      else (v_moved * coalesce((v_settings->>'taxBasisPoints')::integer, 0) + 5000) / 10000 end,
    case when coalesce((v_settings->>'pricingMode') = 'tax_inclusive', false)
      then v_moved - (v_moved * 10000 / (10000 + coalesce((v_settings->>'taxBasisPoints')::integer, 0)))
      else v_moved + ((v_moved * coalesce((v_settings->>'taxBasisPoints')::integer, 0) + 5000) / 10000) end,
    'pos', 'unpaid', v_order.table_id, v_order.customer_name, p_actor
  ) returning id into v_new_order_id;

  select coalesce(max(ticket_number), 0) + 1 into v_ticket_number
    from kitchen_tickets where location_id = v_location_id;
  insert into kitchen_tickets(organization_id, location_id, order_id, ticket_number)
    values (v_organization_id, v_location_id, v_new_order_id, v_ticket_number)
    returning id into v_new_ticket_id;

  for v_item in select oi.* from order_items oi
      where oi.order_id = p_order_id
        and oi.id = any (select (value #>> '{}')::uuid from jsonb_array_elements(p_order_item_ids))
      order by oi.id
  loop
    update order_items set order_id = v_new_order_id where id = v_item.id;
    select * into v_ticket_item from kitchen_ticket_items
      where order_item_id = v_item.id for update;
    if found then
      update kitchen_ticket_items set ticket_id = v_new_ticket_id, updated_at = now()
        where id = v_ticket_item.id;
    end if;
  end loop;

  update orders o
     set subtotal_minor = o.subtotal_minor - v_moved,
         tax_minor = case
           when coalesce((v_settings->>'pricingMode') = 'tax_inclusive', false)
             then ((o.subtotal_minor - v_moved) - ((o.subtotal_minor - v_moved) * 10000 / (10000 + coalesce((v_settings->>'taxBasisPoints')::integer, 0))))
           else ((o.subtotal_minor - v_moved) * coalesce((v_settings->>'taxBasisPoints')::integer, 0) + 5000) / 10000 end,
         total_minor = case
           when coalesce((v_settings->>'pricingMode') = 'tax_inclusive', false)
             then (o.subtotal_minor - v_moved) - ((o.subtotal_minor - v_moved) * 10000 / (10000 + coalesce((v_settings->>'taxBasisPoints')::integer, 0)))
           else (o.subtotal_minor - v_moved) + (((o.subtotal_minor - v_moved) * coalesce((v_settings->>'taxBasisPoints')::integer, 0) + 5000) / 10000) end
   where o.id = p_order_id;

  select count(*) into v_remaining from order_items where order_id = p_order_id;
  if v_remaining = 0 then raise exception 'SPLIT_MUST_LEAVE_ITEMS'; end if;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, p_actor, 'order.split', 'order', p_order_id::text,
      jsonb_build_object('newOrderId', v_new_order_id, 'movedMinor', v_moved::text, 'items', v_moved_count));

  return jsonb_build_object('newOrderId', v_new_order_id, 'ticketNumber', v_ticket_number,
    'movedMinor', v_moved::text, 'items', v_moved_count,
    'originalTotalMinor', (select total_minor::text from orders where id = p_order_id));
end $$;

revoke all on function app_add_order_items(uuid, uuid, jsonb) from public;
grant execute on function app_add_order_items(uuid, uuid, jsonb) to authenticated;
revoke all on function app_record_order_payment(uuid, uuid, bigint, text, text) from public;
grant execute on function app_record_order_payment(uuid, uuid, bigint, text, text) to authenticated;
revoke all on function app_split_order(uuid, uuid, jsonb) from public;
grant execute on function app_split_order(uuid, uuid, jsonb) to authenticated;

commit;
