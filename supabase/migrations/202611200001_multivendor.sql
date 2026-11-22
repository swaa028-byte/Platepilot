-- PlatePilot · multivendor platform (marketplace) foundation
--
-- PlatePilot is already multi-tenant: every restaurant is an organization,
-- with its own locations, staff, menu and storefront slug, isolated by row
-- level security. What a marketplace needs on top of that is money that can
-- be split and a platform-level view that vendors cannot rewrite:
--
--   1. a commission rate per vendor, editable only by the platform operator
--   2. a recorded fee on every order, computed by the database itself so no
--      code path (storefront, counter, catering, aggregator webhook) can skip
--      it or invent a different number
--   3. a platform revenue report across all vendors
--
-- Safe to re-run.

/* ------------------------------------------------------------------ */
/* Who operates the platform                                           */
/* ------------------------------------------------------------------ */

create table if not exists platform_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

create or replace function is_platform_admin(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from platform_admins where user_id = p_user_id);
$$;

revoke all on function is_platform_admin(uuid) from public;
grant execute on function is_platform_admin(uuid) to authenticated, service_role;

alter table platform_admins enable row level security;

drop policy if exists platform_admins_self_read on platform_admins;
create policy platform_admins_self_read on platform_admins
  for select to authenticated using (user_id = auth.uid() or is_platform_admin());

/* ------------------------------------------------------------------ */
/* Commission                                                          */
/* ------------------------------------------------------------------ */

-- Basis points, so 250 = 2.5%. Zero means the vendor keeps everything, which
-- is the honest default for a platform that charges a subscription instead.
alter table organizations add column if not exists commission_bps integer not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_commission_range') then
    alter table organizations add constraint organizations_commission_range
      check (commission_bps between 0 and 3000);
  end if;
end $$;

-- A vendor must not be able to set its own rate. Column privileges are checked
-- before row level security, so the manager write policy cannot widen this.
revoke update (commission_bps) on organizations from authenticated, anon;

create or replace function app_set_commission(p_organization_id uuid, p_commission_bps integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_platform_admin() then raise exception 'FORBIDDEN'; end if;
  if p_commission_bps is null or p_commission_bps < 0 or p_commission_bps > 3000 then
    raise exception 'INVALID_COMMISSION';
  end if;
  update organizations set commission_bps = p_commission_bps, updated_at = now()
   where id = p_organization_id;
  if not found then raise exception 'ORGANIZATION_NOT_FOUND'; end if;
  return jsonb_build_object('organizationId', p_organization_id, 'commissionBps', p_commission_bps);
end;
$$;

revoke all on function app_set_commission(uuid, integer) from public;
grant execute on function app_set_commission(uuid, integer) to authenticated, service_role;

-- The platform's cut of each order, frozen at the rate that applied when the
-- order was placed. Recomputed only when the money actually changes.
alter table orders add column if not exists platform_fee_minor bigint not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_platform_fee_non_negative') then
    alter table orders add constraint orders_platform_fee_non_negative
      check (platform_fee_minor >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_platform_fee_within_total') then
    alter table orders add constraint orders_platform_fee_within_total
      check (platform_fee_minor <= total_minor);
  end if;
end $$;

create or replace function app_apply_platform_fee()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_bps integer := 0;
begin
  -- Cancelled orders earn nothing.
  if new.fulfillment_status = 'cancelled' then
    new.platform_fee_minor := 0;
    return new;
  end if;
  select commission_bps into v_bps from organizations where id = new.organization_id;
  new.platform_fee_minor := (new.total_minor * coalesce(v_bps, 0)) / 10000;
  return new;
end;
$$;

drop trigger if exists orders_platform_fee on orders;
create trigger orders_platform_fee
  before insert or update of total_minor, fulfillment_status, organization_id on orders
  for each row execute function app_apply_platform_fee();

-- Backfill existing rows at today's rate so the report has no holes.
update orders o
   set platform_fee_minor = case when o.fulfillment_status = 'cancelled' then 0
                                else (o.total_minor * coalesce(org.commission_bps, 0)) / 10000 end
  from organizations org
 where org.id = o.organization_id
   and o.platform_fee_minor = 0
   and coalesce(org.commission_bps, 0) > 0;

/* ------------------------------------------------------------------ */
/* Platform revenue across every vendor                                */
/* ------------------------------------------------------------------ */

create or replace function app_platform_revenue(
  p_from timestamptz default date_trunc('month', now()),
  p_to timestamptz default now()
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_rows jsonb;
  v_totals jsonb;
begin
  if not is_platform_admin() then raise exception 'FORBIDDEN'; end if;

  select coalesce(jsonb_agg(row_to_json(per_vendor) order by per_vendor.gmv_minor desc), '[]'::jsonb)
    into v_rows
  from (
    select o.organization_id,
           org.name as organization_name,
           count(*)::bigint as orders,
           sum(o.total_minor)::bigint as gmv_minor,
           sum(o.platform_fee_minor)::bigint as platform_fee_minor,
           org.commission_bps
      from orders o
      join organizations org on org.id = o.organization_id
     where o.created_at >= p_from
       and o.created_at < p_to
       and o.fulfillment_status <> 'cancelled'
     group by o.organization_id, org.name, org.commission_bps
  ) as per_vendor;

  select jsonb_build_object(
           'orders', coalesce(sum((value->>'orders')::bigint), 0),
           'gmvMinor', coalesce(sum((value->>'gmv_minor')::bigint), 0),
           'platformFeeMinor', coalesce(sum((value->>'platform_fee_minor')::bigint), 0)
         )
    into v_totals
    from jsonb_array_elements(v_rows);

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'vendors', v_rows,
    'totals', v_totals
  );
end;
$$;

revoke all on function app_platform_revenue(timestamptz, timestamptz) from public;
grant execute on function app_platform_revenue(timestamptz, timestamptz) to authenticated, service_role;
