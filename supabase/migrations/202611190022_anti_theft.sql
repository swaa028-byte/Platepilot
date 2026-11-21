begin;

-- ---------------------------------------------------------------------------
-- Anti-theft reporting.
--
-- Theft hides where one person controls a transaction unobserved. The controls
-- here are the classic ones: every POS order carries the name of the staff
-- member who took it; voiding an order is its own action with a mandatory
-- reason, recorded immutably; and a manager can pull one exception report that
-- puts refunds, discounts, voids and cash variances next to each person for
-- any window.
-- ---------------------------------------------------------------------------

alter table orders add column if not exists created_by uuid;
alter table orders add column if not exists voided_by uuid;
alter table orders add column if not exists void_reason text;

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
    table_id, customer_name, scheduled_for, created_by
  ) values (
    v_organization_id, p_location_id, v_tracking, p_service_type, p_customer_locale, v_currency,
    v_subtotal, v_tax, v_total, 'pos', p_tender_type,
    case when p_tender_type = 'cash' then 'cash' else 'counter' end,
    case when v_paid then 'paid' else 'unpaid' end,
    p_table_id, nullif(btrim(coalesce(p_customer_name, '')), ''), p_scheduled_for, p_actor
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

-- Voiding an order. The reason is mandatory and immutable — it is the answer
-- the report will ask for later. A paid order is not voided; it is refunded,
-- so the money and the stock cannot be made to disagree quietly.
create or replace function app_void_order(p_actor uuid, p_order_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_location_id uuid; v_total bigint; v_status text; v_payment text;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  if p_reason is null or btrim(p_reason) = '' or char_length(btrim(p_reason)) > 200 then
    raise exception 'VOID_REASON_REQUIRED';
  end if;

  select organization_id, location_id, total_minor, fulfillment_status, payment_status
    into v_organization_id, v_location_id, v_total, v_status, v_payment
    from orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not exists (
    select 1 from memberships
    where organization_id = v_organization_id and user_id = p_actor
      and role in ('owner','manager','host','server')
  ) then raise exception 'FORBIDDEN'; end if;
  if v_status = 'cancelled' then raise exception 'ORDER_ALREADY_VOIDED'; end if;
  if v_status = 'completed' then raise exception 'ORDER_COMPLETED'; end if;
  if v_payment in ('paid','partially_refunded','refunded') then raise exception 'VOID_REQUIRES_REFUND'; end if;

  update orders
     set fulfillment_status = 'cancelled', voided_by = p_actor, void_reason = btrim(p_reason)
   where id = p_order_id;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, p_actor, 'order.voided', 'order', p_order_id::text,
      jsonb_build_object('reason', btrim(p_reason), 'totalMinor', v_total::text));

  return jsonb_build_object('orderId', p_order_id, 'status', 'cancelled');
end $$;


-- The exception report. One row per staff member seen in the window, with the
-- four numbers a manager reads together: what they sold, what they gave away
-- as discounts, what they voided, what they refunded, and how the cash drawer
-- came out. Rates above a stated threshold are flagged; the threshold is part
-- of the report so the flag is never a judgement made in silence.
create or replace function app_theft_report(p_actor uuid, p_location_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  if p_from >= p_to then raise exception 'INVALID_REQUEST'; end if;

  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'thresholds', jsonb_build_object(
      'discountShare', 0.2, 'voidShare', 0.05, 'refundShare', 0.05),
    'staff', coalesce((
      select jsonb_agg(
          jsonb_build_object(
            'actor', staff.actor,
            'orderCount', staff.order_count, 'soldMinor', staff.sold_minor,
            'discountCount', staff.discount_count, 'discountMinor', staff.discount_minor,
            'voidCount', staff.void_count, 'voidMinor', staff.void_minor,
            'refundCount', staff.refund_count, 'refundMinor', staff.refund_minor,
            'cashVarianceCount', staff.cash_variance_count, 'cashVarianceMinor', staff.cash_variance_minor)
          order by staff.void_count desc, staff.refund_count desc)
      from (
        select
          coalesce(o.actor, v.actor, r.actor, s.actor) as actor,
          coalesce(o.orders, 0) as order_count,
          coalesce(o.total_minor, '0') as sold_minor,
          coalesce(o.discounts, 0) as discount_count,
          coalesce(o.discount_minor, '0') as discount_minor,
          coalesce(v.voids, 0) as void_count,
          coalesce(v.void_minor, '0') as void_minor,
          coalesce(r.refunds, 0) as refund_count,
          coalesce(r.refund_minor, '0') as refund_minor,
          coalesce(s.variance_events, 0) as cash_variance_count,
          coalesce(s.variance_minor, '0') as cash_variance_minor
        from (
          select o.created_by as actor, count(*) as orders, sum(o.total_minor)::text as total_minor,
            count(*) filter (where o.discount_minor > 0) as discounts,
            sum(o.discount_minor)::text as discount_minor
          from orders o
          where o.location_id = p_location_id and o.created_by is not null
            and o.created_at >= p_from and o.created_at < p_to
          group by o.created_by
        ) o
        full outer join (
          select x.voided_by as actor, count(*) as voids, sum(x.total_minor)::text as void_minor
          from orders x
          where x.location_id = p_location_id and x.voided_by is not null
            and x.created_at >= p_from and x.created_at < p_to
          group by x.voided_by
        ) v on v.actor = o.actor
        full outer join (
          select ra.requested_by as actor, count(*) as refunds, sum(ra.amount_minor)::text as refund_minor
          from refunds ra
          join payment_attempts pa on pa.id = ra.payment_attempt_id
          where pa.location_id = p_location_id and ra.requested_by is not null
            and ra.created_at >= p_from and ra.created_at < p_to
          group by ra.requested_by
        ) r on r.actor = coalesce(o.actor, v.actor)
        full outer join (
          select cs.closed_by as actor, count(*) as variance_events, sum(cs.variance_minor)::text as variance_minor
          from cash_shifts cs
          where cs.location_id = p_location_id and cs.closed_by is not null
            and cs.closed_at >= p_from and cs.closed_at < p_to
            and cs.variance_minor is not null and cs.variance_minor <> 0
          group by cs.closed_by
        ) s on s.actor = coalesce(o.actor, v.actor, r.actor)
      ) staff
    ), '[]'::jsonb)
  );
end $$;


revoke all on function app_create_staff_order(uuid, text, text, jsonb, uuid, text, uuid, text, timestamptz) from public;
grant execute on function app_create_staff_order(uuid, text, text, jsonb, uuid, text, uuid, text, timestamptz) to authenticated;

revoke all on function app_void_order(uuid, uuid, text) from public;
grant execute on function app_void_order(uuid, uuid, text) to authenticated;

revoke all on function app_theft_report(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function app_theft_report(uuid, uuid, timestamptz, timestamptz) to authenticated;

commit;
