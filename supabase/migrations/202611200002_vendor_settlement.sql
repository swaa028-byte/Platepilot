-- PlatePilot · vendor settlement (single collecting account)
--
-- Payments are collected by the platform's own Paystack account, so the
-- operator owes each vendor its share at the end of a period. This function
-- produces that statement: what came in, what the platform keeps, what is
-- payable to each vendor, per currency.
--
-- When per-vendor payouts are added later (Paystack subaccounts or Stripe
-- Connect), platform_fee_minor is already the number the split uses; this
-- report becomes the reconciliation check instead of the settlement method.
--
-- Safe to re-run.

create or replace function app_vendor_settlement(
  p_from timestamptz default date_trunc('month', now()),
  p_to timestamptz default now()
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_vendors jsonb;
  v_totals jsonb;
begin
  if not is_platform_admin() then raise exception 'FORBIDDEN'; end if;

  select coalesce(jsonb_agg(row_to_json(per_vendor) order by per_vendor.gross_minor desc), '[]'::jsonb)
    into v_vendors
  from (
    select o.organization_id,
           org.name as organization_name,
           o.currency,
           count(*)::bigint as orders,
           -- Everything that was rung up (cancellations excluded).
           sum(o.total_minor)::bigint as gross_minor,
           -- Money actually collected through a provider.
           sum(case when o.payment_status = 'paid' then o.total_minor else 0 end)::bigint as collected_minor,
           -- Refunded money does not belong to anyone.
           sum(case when o.payment_status in ('refunded', 'partially_refunded')
                    then o.total_minor else 0 end)::bigint as refunded_minor,
           sum(o.platform_fee_minor)::bigint as platform_fee_minor,
           org.commission_bps
      from orders o
      join organizations org on org.id = o.organization_id
     where o.created_at >= p_from
       and o.created_at < p_to
       and o.fulfillment_status <> 'cancelled'
     group by o.organization_id, org.name, o.currency, org.commission_bps
  ) as per_vendor;

  -- Net payable per vendor = collected - refunded - platform fee. Cash orders
  -- never touch the platform account, so they are not "payable".
  v_vendors := (
    select coalesce(jsonb_agg(
             v || jsonb_build_object(
               'netPayableMinor',
               coalesce((v->>'collected_minor')::bigint, 0)
                 - coalesce((v->>'refunded_minor')::bigint, 0)
                 - coalesce((v->>'platform_fee_minor')::bigint, 0)
             )
           ), '[]'::jsonb)
      from jsonb_array_elements(v_vendors) as v
  );

  select jsonb_build_object(
           'orders', coalesce(sum((value->>'orders')::bigint), 0),
           'grossMinor', coalesce(sum((value->>'gross_minor')::bigint), 0),
           'collectedMinor', coalesce(sum((value->>'collected_minor')::bigint), 0),
           'refundedMinor', coalesce(sum((value->>'refunded_minor')::bigint), 0),
           'platformFeeMinor', coalesce(sum((value->>'platform_fee_minor')::bigint), 0),
           'netPayableMinor', coalesce(sum((value->>'netPayableMinor')::bigint), 0)
         )
    into v_totals
    from jsonb_array_elements(v_vendors);

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'status', 'manual_settlement',
    'vendors', v_vendors,
    'totals', v_totals
  );
end;
$$;

revoke all on function app_vendor_settlement(timestamptz, timestamptz) from public;
grant execute on function app_vendor_settlement(timestamptz, timestamptz) to authenticated, service_role;
