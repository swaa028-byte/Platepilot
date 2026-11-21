CREATE OR REPLACE FUNCTION public.app_create_order(p_location_id uuid, p_service_type text, p_customer_locale text, p_items jsonb, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone, p_discount_code text DEFAULT NULL::text, p_tip_minor bigint DEFAULT NULL::bigint, p_delivery_address text DEFAULT NULL::text, p_delivery_postal_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
