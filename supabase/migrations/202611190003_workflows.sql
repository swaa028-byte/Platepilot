begin;

create or replace function app_create_merchant(
  p_name text, p_address text, p_legal_country text, p_currency text,
  p_timezone text, p_locale text, p_place_id text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid; v_location_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_currency !~ '^[A-Z]{3}$' or p_locale !~ '^(en|fr|es|pt|ar)$' then raise exception 'INVALID_REQUEST'; end if;
  insert into organizations(name, legal_country, default_locale) values (p_name, p_legal_country, p_locale) returning id into v_organization_id;
  insert into locations(organization_id, name, address, timezone, currency) values (v_organization_id, 'Main location', p_address, p_timezone, p_currency) returning id into v_location_id;
  insert into memberships(organization_id, user_id, role) values (v_organization_id, auth.uid(), 'owner');
  if p_place_id is not null then
    insert into external_listings(organization_id, location_id, external_id, linked_by) values (v_organization_id, v_location_id, p_place_id, auth.uid());
  end if;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id) values (v_organization_id, auth.uid(), 'merchant.created', 'organization', v_organization_id::text);
  return jsonb_build_object('organizationId', v_organization_id, 'locationId', v_location_id);
end $$;

create or replace function app_publish_menu(
  p_organization_id uuid, p_location_id uuid, p_items jsonb, p_actor uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_currency text; v_price_book_id uuid; v_category_id uuid; v_menu_item_id uuid; v_item jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_actor or not exists(select 1 from memberships where organization_id=p_organization_id and user_id=p_actor and role in ('owner','manager')) then raise exception 'FORBIDDEN'; end if;
  select currency into v_currency from locations where id=p_location_id and organization_id=p_organization_id for update;
  if not found or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 500 then raise exception 'INVALID_REQUEST'; end if;
  update price_books set status='archived' where location_id=p_location_id and organization_id=p_organization_id and status='published';
  insert into price_books(organization_id, location_id, currency, status, published_by, published_at) values (p_organization_id, p_location_id, v_currency, 'published', p_actor, now()) returning id into v_price_book_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if v_item->>'currency' <> v_currency or (v_item->>'amountMinor') !~ '^[0-9]+$' then raise exception 'CURRENCY_OR_AMOUNT_MISMATCH'; end if;
    insert into catalog_categories(organization_id, location_id, name) values (p_organization_id, p_location_id, v_item->>'category')
      on conflict (location_id, name) do update set name=excluded.name returning id into v_category_id;
    insert into menu_items(organization_id, location_id, category_id, name, description, allergens, available)
      values (p_organization_id, p_location_id, v_category_id, v_item->>'item', coalesce(v_item->>'description',''), coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(v_item->'allergens','[]'::jsonb))), '{}'), coalesce((v_item->>'available')::boolean,false))
      on conflict (category_id, name) do update set description=excluded.description, allergens=excluded.allergens, available=excluded.available, version=menu_items.version+1 returning id into v_menu_item_id;
    insert into item_prices(price_book_id, menu_item_id, amount_minor) values (v_price_book_id, v_menu_item_id, (v_item->>'amountMinor')::bigint);
  end loop;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id) values (p_organization_id, p_actor, 'menu.published', 'price_book', v_price_book_id::text);
  return v_price_book_id;
end $$;

create or replace function app_save_floor(
  p_organization_id uuid, p_location_id uuid, p_expected_version integer, p_draft jsonb, p_actor uuid
) returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_version integer;
begin
  if auth.uid() is null or auth.uid() <> p_actor or not exists(select 1 from memberships where organization_id=p_organization_id and user_id=p_actor and role in ('owner','manager','host')) then raise exception 'FORBIDDEN'; end if;
  if (p_draft->>'width')::numeric <= 0 or (p_draft->>'depth')::numeric <= 0 then raise exception 'ROOM_DIMENSIONS_REQUIRED'; end if;
  select version into v_version from floor_plans where location_id=p_location_id and organization_id=p_organization_id for update;
  if not found then
    if p_expected_version <> 1 then raise exception 'EDIT_CONFLICT'; end if;
    insert into floor_plans(organization_id, location_id, width_metres, depth_metres, document, version, status, published_by)
      values (p_organization_id, p_location_id, (p_draft->>'width')::numeric, (p_draft->>'depth')::numeric, p_draft, 1, 'published', p_actor);
    return 1;
  end if;
  if v_version <> p_expected_version then raise exception 'EDIT_CONFLICT'; end if;
  update floor_plans set width_metres=(p_draft->>'width')::numeric, depth_metres=(p_draft->>'depth')::numeric, document=p_draft, version=version+1, status='published', published_by=p_actor, updated_at=now()
    where location_id=p_location_id and organization_id=p_organization_id;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id) values (p_organization_id, p_actor, 'floor.published', 'location', p_location_id::text);
  return v_version + 1;
end $$;

create or replace function app_create_order(
  p_location_id uuid, p_service_type text, p_customer_locale text, p_items jsonb, p_scheduled_for timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_currency text; v_order_id uuid; v_tracking text;
  v_item jsonb; v_quantity integer; v_menu_item_id uuid; v_name text; v_description text;
  v_unit_price bigint; v_subtotal bigint := 0;
begin
  if p_service_type !~ '^(pickup|delivery|dine_in)$' or p_customer_locale !~ '^(en|fr|es|pt|ar)$' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'INVALID_REQUEST'; end if;
  select organization_id, currency into v_organization_id, v_currency from locations where id=p_location_id and ordering_enabled=true;
  if not found then raise exception 'ORDERING_NOT_ENABLED'; end if;
  v_tracking := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into orders(organization_id, location_id, tracking_token, service_type, customer_locale, currency, subtotal_minor, total_minor, scheduled_for)
    values (v_organization_id, p_location_id, v_tracking, p_service_type, p_customer_locale, v_currency, 0, 0, p_scheduled_for) returning id into v_order_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity not between 1 and 100 then raise exception 'INVALID_QUANTITY'; end if;
    select mi.id, mi.name, mi.description, ip.amount_minor into v_menu_item_id, v_name, v_description, v_unit_price
      from menu_items mi join item_prices ip on ip.menu_item_id=mi.id join price_books pb on pb.id=ip.price_book_id
      where mi.id=(v_item->>'menuItemId')::uuid and mi.location_id=p_location_id and mi.organization_id=v_organization_id and mi.available=true and pb.status='published' and pb.currency=v_currency;
    if not found then raise exception 'ITEM_UNAVAILABLE'; end if;
    insert into order_items(order_id, menu_item_id, name_snapshot, description_snapshot, quantity, unit_price_minor, line_total_minor, currency)
      values (v_order_id, v_menu_item_id, v_name, v_description, v_quantity, v_unit_price, v_unit_price*v_quantity, v_currency);
    v_subtotal := v_subtotal + v_unit_price*v_quantity;
  end loop;
  update orders set subtotal_minor=v_subtotal, total_minor=v_subtotal where id=v_order_id;
  return jsonb_build_object('orderId', v_order_id, 'trackingToken', v_tracking, 'subtotalMinor', v_subtotal::text, 'totalMinor', v_subtotal::text, 'currency', v_currency, 'paymentStatus', 'unpaid');
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
  insert into audit_events(organization_id, action, entity_type, entity_id, metadata) values (v_order.organization_id, 'payment.applied', 'order', v_order.id::text, jsonb_build_object('attemptId',v_attempt.id,'provider',v_attempt.provider));
  return jsonb_build_object('status','applied');
end $$;

create or replace function app_claim_jobs(p_worker text, p_batch integer default 10)
returns setof jobs language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with selected as (
    select id from jobs where status in ('queued','leased') and available_at <= now() and (lease_until is null or lease_until < now())
    order by created_at for update skip locked limit least(greatest(p_batch,1),50)
  )
  update jobs j set status=case when j.attempts + 1 >= j.max_attempts then 'dead_letter' else 'leased' end,
    attempts=j.attempts+1, leased_by=p_worker, lease_until=now()+interval '30 seconds', updated_at=now()
  from selected where j.id=selected.id returning j.*;
end $$;

revoke all on function app_create_merchant(text,text,text,text,text,text,text) from public;
revoke all on function app_publish_menu(uuid,uuid,jsonb,uuid) from public;
revoke all on function app_save_floor(uuid,uuid,integer,jsonb,uuid) from public;
revoke all on function app_create_order(uuid,text,text,jsonb,timestamptz) from public;
revoke all on function app_apply_verified_payment(uuid,text,text) from public;
revoke all on function app_claim_jobs(text,integer) from public;
grant execute on function app_create_merchant(text,text,text,text,text,text,text) to authenticated;
grant execute on function app_publish_menu(uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function app_save_floor(uuid,uuid,integer,jsonb,uuid) to authenticated;
grant execute on function app_create_order(uuid,text,text,jsonb,timestamptz) to service_role;
grant execute on function app_apply_verified_payment(uuid,text,text) to service_role;
grant execute on function app_claim_jobs(text,integer) to service_role;

commit;
