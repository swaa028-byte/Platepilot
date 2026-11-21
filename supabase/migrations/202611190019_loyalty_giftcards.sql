begin;

-- ---------------------------------------------------------------------------
-- Loyalty and gift cards.
--
-- A customer is identified at checkout by the email they type. Points are
-- earned when an order is actually paid — never on a mere intention to pay —
-- and can be redeemed as a discount on a later order. Gift cards are issued
-- by the merchant with a fixed value and act as a tender: a card that covers
-- the whole total pays for the order outright; a partial cover leaves the
-- rest to be paid the normal way.
-- ---------------------------------------------------------------------------

alter table orders add column if not exists customer_email text;
alter table orders add column if not exists loyalty_points_redeemed bigint not null default 0;
alter table orders add column if not exists gift_card_code text;
alter table orders add column if not exists gift_card_minor bigint not null default 0;

create table loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  earn_points_per_minor bigint not null default 0 check (earn_points_per_minor between 0 and 1000),
  points_per_discount_minor bigint not null default 0 check (points_per_discount_minor between 1 and 1000000),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- The ledger gains the identity it was missing: it was written for a customer
-- row that nothing ever created. Points are now keyed by the organisation and
-- the email the customer gave, with an event key that makes every movement
-- exactly-once.
alter table loyalty_ledger alter column customer_id drop not null;
alter table loyalty_ledger add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table loyalty_ledger add column if not exists location_id uuid references locations(id) on delete cascade;
alter table loyalty_ledger add column if not exists customer_email text;
alter table loyalty_ledger add column if not exists event_key text unique;

create table gift_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null unique,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  initial_minor bigint not null check (initial_minor > 0),
  balance_minor bigint not null check (balance_minor >= 0),
  disabled boolean not null default false,
  created_by uuid, created_at timestamptz not null default now()
);

create table gift_card_transactions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references gift_cards(id) on delete restrict,
  order_id uuid references orders(id) on delete restrict,
  event_id text not null unique,
  amount_minor bigint not null,
  created_at timestamptz not null default now()
);

alter table loyalty_programs enable row level security;
alter table gift_cards enable row level security;
alter table gift_card_transactions enable row level security;

create policy loyalty_programs_member_read on loyalty_programs
  for select to authenticated using (is_organization_member(organization_id));
create policy loyalty_programs_manager_write on loyalty_programs
  for all to authenticated
  using (is_organization_manager(organization_id))
  with check (is_organization_manager(organization_id));
create policy gift_cards_member_read on gift_cards
  for select to authenticated using (is_organization_member(organization_id));
create policy gift_cards_manager_write on gift_cards
  for all to authenticated
  using (is_organization_manager(organization_id))
  with check (is_organization_manager(organization_id));
create policy gift_card_transactions_member_read on gift_card_transactions
  for select to authenticated using (
    exists (select 1 from gift_cards gc where gc.id = gift_card_id and is_organization_member(gc.organization_id)));

-- Merchant configuration.
create or replace function app_configure_loyalty(
  p_actor uuid, p_organization_id uuid, p_earn_points_per_minor bigint,
  p_points_per_discount_minor bigint, p_enabled boolean
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  if not is_organization_manager(p_organization_id) then raise exception 'FORBIDDEN'; end if;
  if p_earn_points_per_minor < 0 or p_earn_points_per_minor > 1000
    or p_points_per_discount_minor < 1 or p_points_per_discount_minor > 1000000 then
    raise exception 'INVALID_REQUEST';
  end if;
  insert into loyalty_programs(organization_id, earn_points_per_minor, points_per_discount_minor, enabled)
    values (p_organization_id, p_earn_points_per_minor, p_points_per_discount_minor, p_enabled)
    on conflict (organization_id) do update
      set earn_points_per_minor = excluded.earn_points_per_minor,
          points_per_discount_minor = excluded.points_per_discount_minor,
          enabled = excluded.enabled, updated_at = now();
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (p_organization_id, p_actor, 'loyalty.configured', 'loyalty_program', p_organization_id::text,
      jsonb_build_object('earn', p_earn_points_per_minor, 'redeem', p_points_per_discount_minor, 'enabled', p_enabled));
  return jsonb_build_object('organizationId', p_organization_id,
    'earnPointsPerMinor', p_earn_points_per_minor::text,
    'pointsPerDiscountMinor', p_points_per_discount_minor::text, 'enabled', p_enabled);
end $$;

create or replace function app_loyalty_config(p_actor uuid, p_organization_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_build_object(
    'earnPointsPerMinor', lp.earn_points_per_minor::text,
    'pointsPerDiscountMinor', lp.points_per_discount_minor::text,
    'enabled', lp.enabled),
    jsonb_build_object('earnPointsPerMinor', '0', 'pointsPerDiscountMinor', '100', 'enabled', false))
  from loyalty_programs lp
  where lp.organization_id = p_organization_id and is_organization_member(lp.organization_id);
$$;

-- The customer's own balance. The email is the capability.
create or replace function app_loyalty_balance(p_organization_id uuid, p_email text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('points', coalesce(sum(l.points), 0)::text)
  from loyalty_ledger l
  where l.organization_id = p_organization_id
    and lower(btrim(coalesce(p_email, ''))) = lower(btrim(l.customer_email));
$$;

-- Issues a gift card with a random, readable code.
create or replace function app_issue_gift_card(p_actor uuid, p_organization_id uuid, p_initial_minor bigint, p_currency text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_code text; v_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  if not is_organization_manager(p_organization_id) then raise exception 'FORBIDDEN'; end if;
  if p_initial_minor <= 0 or p_initial_minor > 100000000000 then raise exception 'INVALID_REQUEST'; end if;
  if p_currency !~ '^[A-Z]{3}$' then raise exception 'INVALID_REQUEST'; end if;
  loop
    v_code := 'GC-' || upper(encode(gen_random_bytes(6), 'hex'))::text;
    v_code := substr(v_code, 1, 5) || '-' || substr(v_code, 6, 4) || '-' || substr(v_code, 10, 4);
    begin
      insert into gift_cards(organization_id, code, currency, initial_minor, balance_minor, created_by)
        values (p_organization_id, v_code, p_currency, p_initial_minor, p_initial_minor, p_actor)
        returning id into v_id;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (p_organization_id, p_actor, 'gift_card.issued', 'gift_card', v_id::text,
      jsonb_build_object('initialMinor', p_initial_minor::text, 'currency', p_currency));
  return jsonb_build_object('giftCardId', v_id, 'code', v_code, 'initialMinor', p_initial_minor::text, 'currency', p_currency);
end $$;

create or replace function app_list_gift_cards(p_actor uuid, p_organization_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'giftCardId', gc.id, 'code', gc.code, 'currency', gc.currency,
    'initialMinor', gc.initial_minor::text, 'balanceMinor', gc.balance_minor::text,
    'disabled', gc.disabled, 'createdAt', gc.created_at) order by gc.created_at desc), '[]'::jsonb)
  from gift_cards gc
  where gc.organization_id = p_organization_id and is_organization_member(gc.organization_id);
$$;

-- The balance a customer may check with the code from their gift card.
create or replace function app_gift_card_balance(p_organization_id uuid, p_code text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'balanceMinor', gc.balance_minor::text, 'currency', gc.currency,
    'valid', gc.disabled = false and gc.balance_minor > 0)
  from gift_cards gc
  where gc.organization_id = p_organization_id and gc.code = upper(btrim(coalesce(p_code, '')));
$$;

-- Disables a gift card (a reported theft, a staff error).
create or replace function app_disable_gift_card(p_actor uuid, p_gift_card_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from gift_cards where id = p_gift_card_id for update;
  if not found then raise exception 'GIFT_CARD_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  update gift_cards set disabled = true where id = p_gift_card_id;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id)
    values (v_organization_id, p_actor, 'gift_card.disabled', 'gift_card', p_gift_card_id::text);
end $$;

commit;
