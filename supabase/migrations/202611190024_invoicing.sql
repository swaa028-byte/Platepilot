begin;

-- ---------------------------------------------------------------------------
-- Invoicing: numbered series and the tax export.
--
-- A series is a numbered counter per location (the law in several of the
-- countries this software serves: invoice numbers run without gaps). An
-- invoice is issued from a paid order exactly once — the order id is unique
-- on the invoice — and the number is taken under a lock on the series row so
-- two simultaneous issues can never claim the same number or skip one.
--
-- The tax export is the accountant's artifact: every invoiced order in a
-- window with its net, tax and total, in minor units, ready for CSV.
-- ---------------------------------------------------------------------------

create table invoice_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null,
  name text not null,
  prefix text not null default '',
  next_number bigint not null default 1 check (next_number >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict,
  unique (location_id, name)
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null,
  series_id uuid not null references invoice_series(id) on delete restrict,
  number text not null unique,
  order_id uuid not null unique references orders(id) on delete restrict,
  issued_at timestamptz not null default now(),
  issued_by uuid,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  net_minor bigint not null check (net_minor >= 0),
  tax_minor bigint not null check (tax_minor >= 0),
  total_minor bigint not null check (total_minor >= 0)
);
create index invoices_location_issued on invoices(location_id, issued_at desc);

alter table invoice_series enable row level security;
alter table invoices enable row level security;
create policy invoice_series_member_read on invoice_series
  for select to authenticated using (is_organization_member(organization_id));
create policy invoice_series_manager_write on invoice_series
  for all to authenticated
  using (is_organization_manager(organization_id))
  with check (is_organization_manager(organization_id));
create policy invoices_member_read on invoices
  for select to authenticated using (is_organization_member(organization_id));

create or replace function app_create_invoice_series(p_actor uuid, p_location_id uuid, p_name text, p_prefix text default '')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  if p_name is null or btrim(p_name) = '' or char_length(btrim(p_name)) > 60 then raise exception 'INVALID_REQUEST'; end if;
  if p_prefix is null or char_length(p_prefix) > 10 then raise exception 'INVALID_REQUEST'; end if;

  insert into invoice_series(organization_id, location_id, name, prefix)
    values (v_organization_id, p_location_id, btrim(p_name), btrim(p_prefix))
    returning id into v_id;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id)
    values (v_organization_id, p_actor, 'invoice_series.created', 'invoice_series', v_id::text);
  return jsonb_build_object('seriesId', v_id, 'name', btrim(p_name), 'prefix', btrim(p_prefix));
end $$;

create or replace function app_list_invoice_series(p_actor uuid, p_location_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'seriesId', s.id, 'name', s.name, 'prefix', s.prefix,
    'nextNumber', s.next_number::text, 'active', s.active) order by s.created_at), '[]'::jsonb)
  from invoice_series s
  where s.location_id = p_location_id and is_organization_member(s.organization_id);
$$;

-- Issues an invoice from a paid order. The number is "<prefix><number>" with
-- no separators added; the merchant chose the shape when creating the series.
create or replace function app_issue_invoice(p_actor uuid, p_order_id uuid, p_series_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_location_id uuid; v_currency text;
  v_net bigint; v_tax bigint; v_total bigint; v_payment text;
  v_series record; v_number text; v_invoice_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;

  select organization_id, location_id, currency, total_minor, tax_minor, payment_status
    into v_organization_id, v_location_id, v_currency, v_total, v_tax, v_payment
    from orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not is_organization_member(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  if v_payment not in ('paid','partially_refunded','refunded') then raise exception 'ORDER_NOT_PAID'; end if;

  -- The chosen series, or the location's first active one.
  if p_series_id is not null then
    select * into v_series from invoice_series
      where id = p_series_id and location_id = v_location_id and active for update;
    if not found then raise exception 'SERIES_NOT_FOUND'; end if;
  else
    select * into v_series from invoice_series
      where location_id = v_location_id and active
      order by created_at limit 1 for update;
    if not found then raise exception 'NO_ACTIVE_SERIES'; end if;
  end if;

  v_number := v_series.prefix || v_series.next_number::text;
  v_net := v_total - v_tax;

  insert into invoices(organization_id, location_id, series_id, number, order_id, issued_by,
      currency, net_minor, tax_minor, total_minor)
    values (v_organization_id, v_location_id, v_series.id, v_number, p_order_id, p_actor,
      v_currency, v_net, v_tax, v_total)
    returning id into v_invoice_id;

  update invoice_series set next_number = next_number + 1 where id = v_series.id;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, p_actor, 'invoice.issued', 'invoice', v_invoice_id::text,
      jsonb_build_object('number', v_number, 'orderId', p_order_id, 'totalMinor', v_total::text));

  return jsonb_build_object('invoiceId', v_invoice_id, 'number', v_number,
    'netMinor', v_net::text, 'taxMinor', v_tax::text, 'totalMinor', v_total::text, 'currency', v_currency);
end $$;

-- The accountant's export: one row per invoice in the window, in the order it
-- was issued, with the money in minor units.
create or replace function app_tax_export(p_actor uuid, p_location_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_member(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  if p_from >= p_to then raise exception 'INVALID_REQUEST'; end if;

  return coalesce(
    jsonb_agg(jsonb_build_object(
      'invoiceNumber', i.number, 'issuedAt', i.issued_at, 'orderId', i.order_id,
      'currency', i.currency, 'netMinor', i.net_minor::text, 'taxMinor', i.tax_minor::text,
      'totalMinor', i.total_minor::text) order by i.issued_at, i.number)
    filter (where true),
    '[]'::jsonb)
  from invoices i
  where i.location_id = p_location_id and i.issued_at >= p_from and i.issued_at < p_to;
end $$;

revoke all on function app_create_invoice_series(uuid, uuid, text, text) from public;
grant execute on function app_create_invoice_series(uuid, uuid, text, text) to authenticated;
revoke all on function app_list_invoice_series(uuid, uuid) from public;
grant execute on function app_list_invoice_series(uuid, uuid) to authenticated;
revoke all on function app_issue_invoice(uuid, uuid, uuid) from public;
grant execute on function app_issue_invoice(uuid, uuid, uuid) to authenticated;
revoke all on function app_tax_export(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function app_tax_export(uuid, uuid, timestamptz, timestamptz) to authenticated;

commit;
