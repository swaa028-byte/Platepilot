begin;

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

commit;
