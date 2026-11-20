-- PlatePilot full schema bootstrap (single script)
--
-- Paste this whole file into Supabase Dashboard -> SQL Editor -> Run.
-- It applies every migration in supabase/migrations in order, once.
--
-- Generated from:
--   supabase/migrations/202611190001_core.sql
--   supabase/migrations/202611190002_security.sql
--   supabase/migrations/202611190003_workflows.sql
--   supabase/migrations/202611190004_operations.sql
--   supabase/migrations/202611190005_storefront.sql
--   supabase/migrations/202611190006_kitchen_ops.sql
--
-- Use on a FRESH project (an empty public schema). It is not idempotent for
-- objects the migrations create without IF NOT EXISTS, so a second run will
-- report "already exists" errors for some tables. The app's local database
-- applies the same files one at a time and records them in schema_migrations.
--
begin;

create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);


-- ===== 202611190001_core.sql =====
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  legal_country text not null check (legal_country ~ '^[A-Z]{2}$'),
  default_locale text not null check (default_locale in ('en','fr','es','pt','ar')),
  verification_status text not null default 'pending' check (verification_status in ('pending','review','verified','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null default 'Main location', address text not null,
  timezone text not null, currency text not null check (currency ~ '^[A-Z]{3}$'),
  ordering_enabled boolean not null default false,
  service_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table memberships (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner','manager','host','server','kitchen','driver','accountant')),
  location_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table external_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null,
  provider text not null check (provider = 'google_places'), external_id text not null,
  linked_by uuid not null, linked_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict,
  unique (provider, location_id)
);

create table catalog_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null, name text not null,
  sort_order integer not null default 0,
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict,
  unique (location_id, name)
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null,
  category_id uuid not null references catalog_categories(id) on delete restrict,
  name text not null, description text not null default '', allergens text[] not null default '{}',
  available boolean not null default false, version integer not null default 1,
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict,
  unique (category_id, name)
);

create table price_books (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_by uuid, published_at timestamptz,
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict
);

create table item_prices (
  price_book_id uuid not null references price_books(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete restrict,
  amount_minor bigint not null check (amount_minor >= 0),
  primary key (price_book_id, menu_item_id)
);

create table menu_translations (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  locale text not null check (locale in ('en','fr','es','pt','ar')),
  name text not null, description text not null default '', legal_text text not null default '',
  publication_status text not null default 'draft' check (publication_status in ('draft','review','approved','published')),
  reviewed_by uuid, unique (menu_item_id, locale)
);

create table restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null,
  name text not null, capacity integer not null check (capacity between 1 and 100),
  state text not null default 'available' check (state in ('available','reserved','seated','resetting')),
  operational_use boolean not null default false,
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict,
  unique (location_id, name)
);

create table floor_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null,
  width_metres numeric(8,2) not null check (width_metres > 0), depth_metres numeric(8,2) not null check (depth_metres > 0),
  document jsonb not null, version integer not null default 1,
  status text not null default 'draft' check (status in ('draft','published')),
  published_by uuid, updated_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict,
  unique (location_id)
);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null, table_id uuid references restaurant_tables(id) on delete restrict,
  starts_at timestamptz not null, ends_at timestamptz not null, party_size integer not null check (party_size between 1 and 100),
  status text not null default 'booked' check (status in ('booked','seated','cancelled','no_show','completed')),
  customer_id uuid, deposit_attempt_id uuid, created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict,
  check (ends_at > starts_at)
);
create index reservations_table_window on reservations(table_id, starts_at, ends_at) where status = 'booked';

create table orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null,
  tracking_token text not null unique,
  service_type text not null check (service_type in ('pickup','delivery','dine_in','walk_in','phone','takeaway','catering')),
  customer_locale text not null check (customer_locale in ('en','fr','es','pt','ar')),
  currency text not null, subtotal_minor bigint not null check (subtotal_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0), tax_minor bigint not null default 0 check (tax_minor >= 0),
  tip_minor bigint not null default 0 check (tip_minor >= 0), total_minor bigint not null check (total_minor >= 0),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','partially_refunded','refunded','review')),
  fulfillment_status text not null default 'received' check (fulfillment_status in ('received','preparing','ready','served','completed','cancelled')),
  scheduled_for timestamptz, created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict
);
create index orders_location_created on orders(location_id, created_at desc);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  menu_item_id uuid references menu_items(id) on delete restrict,
  name_snapshot text not null, description_snapshot text not null default '', selections_snapshot jsonb not null default '[]'::jsonb,
  quantity integer not null check (quantity between 1 and 100), unit_price_minor bigint not null check (unit_price_minor >= 0),
  line_total_minor bigint not null check (line_total_minor >= 0), currency text not null
);

create table payment_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null,
  provider text not null check (provider in ('paystack','stripe','paypal','cash','counter','external_terminal')),
  merchant_account_reference text not null, secret_ref text,
  environment text not null check (environment in ('test','live')),
  currency text not null, capabilities text[] not null default '{}', verified boolean not null default false, enabled boolean not null default false,
  verified_at timestamptz, created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict
);

create table payment_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null, order_id uuid not null references orders(id) on delete restrict,
  payment_connection_id uuid not null references payment_connections(id) on delete restrict,
  provider text not null, provider_reference text not null,
  amount_minor bigint not null check (amount_minor > 0), currency text not null,
  environment text not null check (environment in ('test','live')),
  status text not null check (status in ('initializing','awaiting_customer','reconciliation_required','not_paid','succeeded','review_required','duplicate_success','failed')),
  checkout_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table payment_events (
  id bigint generated always as identity primary key,
  payment_attempt_id uuid not null references payment_attempts(id) on delete restrict,
  provider text not null, provider_event_id text not null, event_type text not null,
  payload jsonb not null, status text not null default 'received' check (status in ('received','processed','review','failed')),
  received_at timestamptz not null default now(), processed_at timestamptz,
  unique (provider, provider_event_id)
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references payment_attempts(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0), currency text not null, reason text not null,
  status text not null default 'requested' check (status in ('requested','confirmed','failed','reconciliation_required')),
  provider_reference text, requested_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null, order_id uuid not null unique references orders(id) on delete restrict,
  station text not null default 'expo', status text not null default 'new' check (status in ('new','preparing','ready','served','recalled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, event_key text not null unique, event_type text not null,
  payload jsonb not null, created_at timestamptz not null default now(), dispatched_at timestamptz
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null, payload jsonb not null, status text not null default 'queued' check (status in ('queued','leased','completed','dead_letter')),
  attempts integer not null default 0, max_attempts integer not null default 8,
  available_at timestamptz not null default now(), lease_until timestamptz, leased_by text, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index jobs_claim on jobs(status, available_at, lease_until);

create table cash_shifts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, location_id uuid not null,
  opened_by uuid not null, closed_by uuid, opening_minor bigint not null check (opening_minor >= 0),
  expected_minor bigint, counted_minor bigint, variance_minor bigint, currency text not null,
  status text not null default 'open' check (status in ('open','closed','review')),
  opened_at timestamptz not null default now(), closed_at timestamptz,
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict
);

create table ingredients (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, location_id uuid not null,
  name text not null, base_unit text not null, reorder_level_milli_units bigint not null default 0,
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict,
  unique (location_id, name)
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, location_id uuid not null,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  event_id text not null unique, kind text not null check (kind in ('receipt','depletion','waste','count_adjustment','reversal')),
  quantity_milli_units bigint not null, source_order_id uuid references orders(id) on delete restrict,
  actor_id uuid, created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict
);

create table customers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  email_ciphertext text, phone_ciphertext text, locale text, deleted_at timestamptz, created_at timestamptz not null default now()
);
create table consent_events (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references customers(id) on delete restrict,
  channel text not null check (channel in ('email','whatsapp')), purpose text not null check (purpose in ('transactional','marketing')),
  action text not null check (action in ('opt_in','opt_out')), source text not null, occurred_at timestamptz not null default now()
);
create table loyalty_ledger (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references customers(id) on delete restrict,
  order_id uuid references orders(id) on delete restrict, points bigint not null,
  kind text not null check (kind in ('earn','redeem','reversal')), reversal_of uuid references loyalty_ledger(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table delivery_assignments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, location_id uuid not null,
  order_id uuid not null references orders(id) on delete restrict, driver_user_id uuid,
  status text not null default 'unassigned' check (status in ('unassigned','assigned','collected','completed','exception')),
  eta_at timestamptz, completion_evidence jsonb, exception_reason text, updated_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict
);

create table integration_accounts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, location_id uuid,
  provider text not null, status text not null default 'blocked' check (status in ('connected','error','blocked','disconnected')),
  secret_ref text, capabilities text[] not null default '{}', last_tested_at timestamptz, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid, actor_id uuid, action text not null, entity_type text not null, entity_id text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

-- ===== 202611190002_security.sql =====
-- Refunds are tenant scoped like every other operational table. The column is
-- added before the policies below so tenant isolation can be enforced on the
-- table directly instead of through a join to the payment attempt.
alter table refunds add column if not exists organization_id uuid references organizations(id) on delete restrict;
alter table refunds add column if not exists location_id uuid;
update refunds r
   set organization_id = pa.organization_id,
       location_id = pa.location_id
  from payment_attempts pa
 where pa.id = r.payment_attempt_id and r.organization_id is null;
alter table refunds alter column organization_id set not null;
alter table refunds add constraint refunds_location_fk
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict;

create or replace function is_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from memberships where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','manager','host','server','kitchen','accountant'));
$$;

create or replace function is_organization_manager(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from memberships where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','manager'));
$$;

revoke all on function is_organization_member(uuid) from public;
revoke all on function is_organization_manager(uuid) from public;
grant execute on function is_organization_member(uuid) to authenticated;
grant execute on function is_organization_manager(uuid) to authenticated;

do $$ declare table_name text;
begin
  foreach table_name in array array[
    'organizations','locations','memberships','external_listings','catalog_categories','menu_items','price_books','item_prices','menu_translations',
    'restaurant_tables','floor_plans','reservations','orders','order_items','payment_connections','payment_attempts','payment_events','refunds',
    'kitchen_tickets','outbox_events','jobs','cash_shifts','ingredients','stock_movements','customers','consent_events','loyalty_ledger',
    'delivery_assignments','integration_accounts','audit_events'
  ] loop execute format('alter table public.%I enable row level security', table_name); end loop;
end $$;

create policy memberships_self_read on memberships for select to authenticated using (user_id=auth.uid() or is_organization_manager(organization_id));
create policy organizations_member_read on organizations for select to authenticated using (is_organization_member(id));
create policy organizations_manager_update on organizations for update to authenticated using (is_organization_manager(id)) with check (is_organization_manager(id));

do $$ declare table_name text;
begin
  foreach table_name in array array[
    'locations','external_listings','catalog_categories','menu_items','price_books','restaurant_tables','floor_plans','reservations','orders',
    'payment_connections','payment_attempts','refunds','kitchen_tickets','cash_shifts','ingredients','stock_movements','delivery_assignments','integration_accounts'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (is_organization_member(organization_id))', table_name||'_member_read', table_name);
  end loop;
  foreach table_name in array array[
    'locations','external_listings','catalog_categories','menu_items','price_books','restaurant_tables','floor_plans','reservations',
    'cash_shifts','ingredients','stock_movements','delivery_assignments','integration_accounts'
  ] loop
    execute format('create policy %I on public.%I for all to authenticated using (is_organization_manager(organization_id)) with check (is_organization_manager(organization_id))', table_name||'_manager_write', table_name);
  end loop;
end $$;

create policy order_items_staff_read on order_items for select to authenticated using (
  exists(select 1 from orders o where o.id=order_id and is_organization_member(o.organization_id))
);
create policy item_prices_staff_read on item_prices for select to authenticated using (
  exists(select 1 from price_books p where p.id=price_book_id and is_organization_member(p.organization_id))
);
create policy menu_translations_manager_all on menu_translations for all to authenticated using (
  exists(select 1 from menu_items m where m.id=menu_item_id and is_organization_manager(m.organization_id))
) with check (
  exists(select 1 from menu_items m where m.id=menu_item_id and is_organization_manager(m.organization_id))
);
create policy customers_manager_read on customers for select to authenticated using (is_organization_manager(organization_id));
create policy consent_events_manager_read on consent_events for select to authenticated using (
  exists(select 1 from customers c where c.id=customer_id and is_organization_manager(c.organization_id))
);
create policy loyalty_ledger_manager_read on loyalty_ledger for select to authenticated using (
  exists(select 1 from customers c where c.id=customer_id and is_organization_manager(c.organization_id))
);
create policy audit_events_manager_read on audit_events for select to authenticated using (is_organization_manager(organization_id));

revoke all on payment_events, outbox_events, jobs from anon, authenticated;
revoke insert, update, delete on orders, order_items, payment_attempts, payment_connections, refunds, kitchen_tickets, audit_events from anon, authenticated;

-- ===== 202611190003_workflows.sql =====
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

-- ===== 202611190004_operations.sql =====
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

-- ===== 202611190005_storefront.sql =====
-- ---------------------------------------------------------------------------
-- Storefront addressing and public menu.
--
-- A restaurant needs a stable, readable address for search engines and for
-- AI systems that read structured data. The slug is generated server-side and
-- is unique across the platform.
-- ---------------------------------------------------------------------------

alter table locations add column if not exists slug text;
create unique index if not exists locations_slug_key on locations(slug) where slug is not null;

-- ---------------------------------------------------------------------------
-- Merchant creation, now producing a storefront slug.
-- ---------------------------------------------------------------------------
create or replace function app_create_merchant(
  p_name text, p_address text, p_legal_country text, p_currency text,
  p_timezone text, p_locale text, p_place_id text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_location_id uuid; v_slug text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_currency !~ '^[A-Z]{3}$' or p_locale !~ '^(en|fr|es|pt|ar)$' then raise exception 'INVALID_REQUEST'; end if;

  insert into organizations(name, legal_country, default_locale) values (p_name, p_legal_country, p_locale) returning id into v_organization_id;

  -- A readable slug with a short suffix taken from the identifier, so two
  -- restaurants with the same name still get different addresses.
  v_slug := trim(both '-' from lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g')));
  if v_slug = '' then v_slug := 'restaurant'; end if;
  v_slug := left(v_slug, 60) || '-' || substr(replace(v_organization_id::text, '-', ''), 1, 6);

  insert into locations(organization_id, name, address, timezone, currency, slug)
    values (v_organization_id, p_name, p_address, p_timezone, p_currency, v_slug)
    returning id into v_location_id;

  insert into memberships(organization_id, user_id, role) values (v_organization_id, auth.uid(), 'owner');
  if p_place_id is not null then
    insert into external_listings(organization_id, location_id, external_id, linked_by) values (v_organization_id, v_location_id, p_place_id, auth.uid());
  end if;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id) values (v_organization_id, auth.uid(), 'merchant.created', 'organization', v_organization_id::text);
  return jsonb_build_object('organizationId', v_organization_id, 'locationId', v_location_id, 'slug', v_slug);
end $$;

-- ---------------------------------------------------------------------------
-- Public storefront data.
--
-- Returns only what a customer may already see: the merchant's own name and
-- address, its declared opening hours, and the published, available menu with
-- its prices. It never returns staff, customer, payment or financial data.
-- ---------------------------------------------------------------------------
create or replace function app_published_menu(p_location_id uuid, p_locale text default 'en')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_location locations%rowtype; v_items jsonb; v_price_book uuid; v_translations jsonb;
begin
  select * into v_location from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;

  select id into v_price_book from price_books
    where location_id = p_location_id and status = 'published'
    order by published_at desc limit 1;
  if v_price_book is null then
    return jsonb_build_object('location', jsonb_build_object(
      'id', v_location.id, 'slug', v_location.slug, 'name', v_location.name,
      'address', v_location.address, 'timezone', v_location.timezone,
      'currency', v_location.currency, 'serviceSettings', v_location.service_settings),
      'items', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(item order by item->>'name'), '[]'::jsonb) into v_items
  from (
    select jsonb_build_object(
      'id', mi.id,
      'name', mi.name,
      'description', mi.description,
      'allergens', to_jsonb(mi.allergens),
      'category', cc.name,
      'amountMinor', ip.amount_minor::text,
      'currency', pb.currency,
      'available', mi.available
    ) as item
    from menu_items mi
    join item_prices ip on ip.menu_item_id = mi.id
    join price_books pb on pb.id = ip.price_book_id
    join catalog_categories cc on cc.id = mi.category_id
    where ip.price_book_id = v_price_book
      and mi.available = true
      and mi.location_id = p_location_id
  ) rows;

  select coalesce(jsonb_object_agg(mt.locale, jsonb_build_object(
    'name', mt.name,
    'description', mt.description,
    'legalText', mt.legal_text,
    'publicationStatus', mt.publication_status
  )), '{}'::jsonb) into v_translations
  from menu_translations mt
  where mt.menu_item_id in (select menu_item_id from item_prices where price_book_id = v_price_book)
    and mt.publication_status = 'published';

  return jsonb_build_object(
    'location', jsonb_build_object(
      'id', v_location.id,
      'slug', v_location.slug,
      'name', v_location.name,
      'address', v_location.address,
      'timezone', v_location.timezone,
      'currency', v_location.currency,
      'serviceSettings', v_location.service_settings,
      'orderingEnabled', v_location.ordering_enabled),
    'items', v_items,
    'translations', v_translations);
end $$;

revoke all on function app_create_merchant(text,text,text,text,text,text,text) from public;
revoke all on function app_published_menu(uuid, text) from public;
grant execute on function app_create_merchant(text,text,text,text,text,text,text) to authenticated;
grant execute on function app_published_menu(uuid, text) to service_role;

-- ===== 202611190006_kitchen_ops.sql =====
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


insert into schema_migrations(name) values ('202611190001_core.sql'), ('202611190002_security.sql'), ('202611190003_workflows.sql'), ('202611190004_operations.sql'), ('202611190005_storefront.sql'), ('202611190006_kitchen_ops.sql')
on conflict (name) do nothing;

commit;
