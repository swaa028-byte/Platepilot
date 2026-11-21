begin;

-- ---------------------------------------------------------------------------
-- Loyalty and gift cards at order time.
--
-- app_create_order gains three optional inputs: the customer's email (the
-- loyalty identity), points to redeem, and a gift-card code. Redemption and
-- the gift-card debit are ledger rows keyed by the order, so a retried
-- checkout cannot spend twice. A gift card that covers the whole total pays
-- for the order outright and sends it to the kitchen, exactly as a verified
-- online payment does.
-- ---------------------------------------------------------------------------

-- The previous nine-parameter entry point is replaced by the extended one;
-- keeping both would let orders reach the kitchen without the new ledgers.
drop function if exists app_create_order(uuid, text, text, jsonb, timestamptz, text, bigint, text, text);

create or replace function app_create_order(
  p_location_id uuid,
  p_service_type text,
  p_customer_locale text,
  p_items jsonb,
  p_scheduled_for timestamptz default null,
  p_discount_code text default null,
  p_tip_minor bigint default null,
  p_delivery_address text default null,
  p_delivery_postal_code text default null,
  p_customer_email text default null,
  p_redeem_loyalty_points bigint default null,
  p_gift_card_code text default null
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
  v_email text; v_loyalty_discount bigint := 0; v_points_used bigint := 0;
  v_gift gift_cards%rowtype; v_gift_cover bigint := 0; v_paid_by_gift boolean := false;
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

  -- Loyalty redemption. The email the customer gave is the identity; the
  -- points are converted at the programme's rate and capped so the order can
  -- never go below zero. The ledger row is written here, keyed by the order,
  -- so a retried request cannot spend the points twice.
  v_email := lower(btrim(coalesce(p_customer_email, '')));
  if v_email <> '' and p_redeem_loyalty_points is not null and p_redeem_loyalty_points > 0 then
    if not exists (
      select 1 from loyalty_programs lp
      where lp.organization_id = v_organization_id and lp.enabled and lp.points_per_discount_minor > 0
    ) then raise exception 'LOYALTY_NOT_AVAILABLE'; end if;
    select coalesce(sum(l.points), 0) into v_points_used
      from loyalty_ledger l
      where l.organization_id = v_organization_id and lower(btrim(l.customer_email)) = v_email
      for update;
    if p_redeem_loyalty_points > v_points_used then raise exception 'LOYALTY_INSUFFICIENT_POINTS'; end if;
    select points_per_discount_minor into v_points_used
      from loyalty_programs where organization_id = v_organization_id;
    v_loyalty_discount := p_redeem_loyalty_points / v_points_used;
    if v_loyalty_discount <= 0 then raise exception 'LOYALTY_INSUFFICIENT_POINTS'; end if;
    if v_loyalty_discount > v_subtotal - v_discount then
      v_loyalty_discount := v_subtotal - v_discount;
      v_points_used := v_loyalty_discount * v_points_used;
    else
      v_points_used := p_redeem_loyalty_points;
    end if;
    v_discount := v_discount + v_loyalty_discount;
  else
    v_email := nullif(v_email, '');
    v_points_used := 0;
  end if;

  -- A gift card is a tender. It is locked for the duration of the order so
  -- two simultaneous checkouts cannot both spend the last of the balance.
  if p_gift_card_code is not null then
    select * into v_gift from gift_cards
      where organization_id = v_organization_id and code = upper(btrim(p_gift_card_code))
      for update;
    if not found then raise exception 'GIFT_CARD_NOT_FOUND'; end if;
    if v_gift.disabled or v_gift.currency <> v_currency or v_gift.balance_minor <= 0 then
      raise exception 'GIFT_CARD_NOT_VALID';
    end if;
  end if;

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

  if v_gift.id is not null then
    v_gift_cover := least(v_gift.balance_minor, v_total);
    v_paid_by_gift := v_gift_cover = v_total;
  end if;

  v_tracking := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into orders(
    organization_id, location_id, tracking_token, service_type, customer_locale, currency,
    subtotal_minor, discount_minor, tax_minor, tip_minor, total_minor,
    delivery_fee_minor, tax_basis_points, discount_code, scheduled_for,
    delivery_address, delivery_postal_code, source_channel, delivery_zone_id,
    customer_email, loyalty_points_redeemed, gift_card_code, gift_card_minor
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

  if v_points_used > 0 then
    insert into loyalty_ledger(organization_id, location_id, customer_email, order_id, points, kind, event_key)
      values (v_organization_id, p_location_id, v_email, v_order_id, -v_points_used, 'redeem',
        'loyalty.redeem:' || v_order_id::text)
      on conflict (event_key) do nothing;
  end if;

  if v_gift.id is not null and v_gift_cover > 0 then
    insert into gift_card_transactions(gift_card_id, order_id, event_id, amount_minor)
      values (v_gift.id, v_order_id, 'gift_card.redeem:' || v_order_id::text, -v_gift_cover)
      on conflict (event_id) do nothing;
    update gift_cards set balance_minor = balance_minor - v_gift_cover where id = v_gift.id;
  end if;

  if v_paid_by_gift then
    update orders set payment_status = 'paid', payment_provider = 'gift_card' where id = v_order_id;
    insert into kitchen_tickets(organization_id, location_id, order_id)
      values (v_organization_id, p_location_id, v_order_id) on conflict (order_id) do nothing;
    insert into outbox_events(organization_id, event_key, event_type, payload)
      values (v_organization_id, 'order.paid:' || v_order_id::text, 'order.paid',
        jsonb_build_object('orderId', v_order_id))
      on conflict (event_key) do nothing;
  end if;

  insert into audit_events(organization_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, 'order.created', 'order', v_order_id::text,
      jsonb_build_object('channel', 'storefront', 'serviceType', p_service_type,
        'loyaltyPoints', v_points_used, 'giftCardMinor', v_gift_cover));

  return jsonb_build_object(
    'orderId', v_order_id, 'trackingToken', v_tracking,
    'currency', v_currency,
    'subtotalMinor', v_subtotal::text, 'discountMinor', v_discount::text,
    'taxMinor', v_tax::text, 'serviceFeeMinor', v_service_fee::text,
    'deliveryFeeMinor', v_delivery_fee::text, 'tipMinor', v_tip::text,
    'deliveryZoneId', v_zone.id, 'totalMinor', v_total::text,
    'giftCardMinor', v_gift_cover::text, 'loyaltyPointsRedeemed', v_points_used::text,
    'paymentStatus', case when v_paid_by_gift then 'paid' else 'unpaid' end);
end $$;

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
  update orders set payment_status='paid' where id=v_order.id;
  insert into kitchen_tickets(organization_id, location_id, order_id) values (v_order.organization_id, v_order.location_id, v_order.id) on conflict(order_id) do nothing;
  insert into outbox_events(organization_id, event_key, event_type, payload) values (v_order.organization_id, 'order.paid:'||v_order.id::text, 'order.paid', jsonb_build_object('orderId',v_order.id,'attemptId',v_attempt.id)) on conflict(event_key) do nothing;
  -- Loyalty points are earned on money that actually arrived, once per order.
  if v_order.customer_email is not null then
    insert into loyalty_ledger(organization_id, location_id, customer_email, order_id, points, kind, event_key)
      select v_order.organization_id, v_order.location_id, v_order.customer_email, v_order.id,
        (v_order.total_minor * lp.earn_points_per_minor), 'earn',
        'loyalty.earn:' || v_order.id::text
      from loyalty_programs lp
      where lp.organization_id = v_order.organization_id and lp.enabled and lp.earn_points_per_minor > 0
      on conflict (event_key) do nothing;
  end if;

  insert into audit_events(organization_id, action, entity_type, entity_id, metadata) values (v_order.organization_id, 'payment.applied', 'order', v_order.id::text, jsonb_build_object('attemptId',v_attempt.id,'provider',v_attempt.provider));
  return jsonb_build_object('status','applied');
end $$;

revoke all on function app_create_order(uuid,text,text,jsonb,timestamptz,text,bigint,text,text,text,bigint,text) from public;
grant execute on function app_create_order(uuid,text,text,jsonb,timestamptz,text,bigint,text,text,text,bigint,text) to anon, authenticated, service_role;

revoke all on function app_apply_verified_payment(uuid,text,text) from public;
grant execute on function app_apply_verified_payment(uuid,text,text) to service_role;

commit;
