begin;

-- ---------------------------------------------------------------------------
-- Stripe checkout, end to end.
--
-- A merchant connects Stripe per location. The connection already carries the
-- API secret reference; the webhook endpoint needs its own signing secret, so
-- the connection gains a second indirect reference. Rows never hold secrets.
-- ---------------------------------------------------------------------------

alter table payment_connections add column if not exists webhook_secret_ref text;

-- The customer-facing order status read: a visitor who holds the order's
-- tracking token may read that one order's status. Nothing else is exposed.
create or replace function app_public_order_status(p_order_id uuid, p_tracking_token text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_order orders%rowtype;
begin
  if p_tracking_token is null or length(p_tracking_token) < 32 then raise exception 'INVALID_REQUEST'; end if;
  select * into v_order from orders where id = p_order_id and tracking_token = p_tracking_token;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  return jsonb_build_object(
    'orderId', v_order.id,
    'paymentStatus', v_order.payment_status,
    'fulfillmentStatus', v_order.fulfillment_status,
    'totalMinor', v_order.total_minor::text,
    'currency', v_order.currency,
    'createdAt', v_order.created_at
  );
end $$;

revoke all on function app_public_order_status(uuid, text) from public;
grant execute on function app_public_order_status(uuid, text) to anon, authenticated, service_role;

commit;
