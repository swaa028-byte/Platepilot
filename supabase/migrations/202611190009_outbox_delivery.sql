-- Outbound delivery for the transactional outbox.
--
-- Business functions write events into outbox_events (order.paid,
-- payment.review_required, kitchen.ticket_*, refund.requested) and, until now, nothing ever read
-- them: the rows accumulated with dispatched_at unset forever. This migration
-- gives those events somewhere to go and a delivery record that can be retried.
--
-- A merchant registers an HTTPS webhook per organization. The relay delivers
-- every event to each active webhook, signing the body with the webhook's own
-- secret so the receiver can trust it. A failed delivery becomes a job of kind
-- 'webhook.deliver' and is retried with backoff through the existing jobs
-- lease; an event is marked dispatched only when nothing is pending for it.

create table outbox_webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  secret text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, url)
);

create table outbox_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references outbox_events(id) on delete cascade,
  webhook_id uuid not null references outbox_webhooks(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','delivered','failed')),
  attempts integer not null default 0,
  last_status_code integer,
  last_error text,
  updated_at timestamptz not null default now(),
  unique (event_id, webhook_id)
);
create index outbox_deliveries_retry on outbox_deliveries(status, updated_at);

-- The drain reads due events. Service role only: the relay runs from the
-- scheduled worker, not from a user request.
create or replace function app_outbox_due_events(p_limit integer default 50)
returns table(event_id uuid, organization_id uuid, event_type text, payload jsonb, event_created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.id, e.organization_id, e.event_type, e.payload, e.created_at
  from outbox_events e
  where e.dispatched_at is null
  order by e.created_at
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;

-- Webhooks for one event, with this event's delivery state per webhook. The
-- relay attempts only rows whose delivery has never been attempted; 'pending'
-- rows belong to a scheduled retry job, 'delivered' and 'failed' are settled.
create or replace function app_outbox_webhooks_for_event(p_event_id uuid)
returns table(webhook_id uuid, webhook_url text, webhook_secret text, delivery_id uuid, delivery_status text)
language sql stable security definer set search_path = public, pg_temp as $$
  select w.id, w.url, w.secret, d.id, d.status
  from outbox_webhooks w
  join outbox_events e on e.id = p_event_id and e.organization_id = w.organization_id
  left join outbox_deliveries d on d.webhook_id = w.id and d.event_id = p_event_id
  where w.active
  order by w.created_at;
$$;

create or replace function app_outbox_delivery_upsert(
  p_event_id uuid, p_webhook_id uuid, p_ok boolean, p_status_code integer, p_error text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into outbox_deliveries(event_id, webhook_id, status, attempts, last_status_code, last_error, updated_at)
  values (p_event_id, p_webhook_id,
          case when p_ok then 'delivered' else 'pending' end, 1, p_status_code, p_error, now())
  on conflict (event_id, webhook_id) do update
    set attempts = outbox_deliveries.attempts + 1,
        status = case when p_ok then 'delivered' else 'pending' end,
        last_status_code = p_status_code,
        last_error = p_error,
        updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- Mark an event dispatched once nothing is pending for it. Called after the
-- relay pass and after each successful retry; the guard keeps an event with a
-- live retry from being reported as fully delivered.
create or replace function app_outbox_mark_dispatched(p_event_id uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update outbox_events e
  set dispatched_at = now()
  where e.id = p_event_id and e.dispatched_at is null
    and not exists (select 1 from outbox_deliveries d where d.event_id = p_event_id and d.status = 'pending');
  return found;
end $$;

-- Schedule a retry through the jobs lease. One live job per event/webhook pair;
-- calling again while one is queued or leased is a no-op returning null.
create or replace function app_outbox_enqueue_retry(p_event_id uuid, p_webhook_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job uuid;
begin
  select id into v_job from jobs
  where kind = 'webhook.deliver'
    and status in ('queued','leased')
    and payload->>'eventId' = p_event_id::text
    and payload->>'webhookId' = p_webhook_id::text
  limit 1;
  if v_job is not null then return null; end if;
  insert into jobs(kind, payload)
  values ('webhook.deliver', jsonb_build_object('eventId', p_event_id, 'webhookId', p_webhook_id))
  returning id into v_job;
  return v_job;
end $$;

-- What a retry job needs to redeliver.
create or replace function app_webhook_delivery_for_job(p_event_id uuid, p_webhook_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'deliveryId', d.id, 'url', w.url, 'secret', w.secret,
    'attempts', d.attempts, 'active', w.active,
    'eventType', e.event_type, 'payload', e.payload,
    'eventCreatedAt', e.created_at, 'organizationId', e.organization_id)
  from outbox_deliveries d
  join outbox_webhooks w on w.id = d.webhook_id
  join outbox_events e on e.id = d.event_id
  where d.event_id = p_event_id and d.webhook_id = p_webhook_id;
$$;

-- Record a retry outcome. Returns 'delivered', 'retry' or 'failed' (retries
-- exhausted) so the caller can settle the job row accordingly.
create or replace function app_webhook_delivery_result(
  p_delivery_id uuid, p_ok boolean, p_status_code integer, p_error text, p_max_attempts integer default 8
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_event uuid; v_status text;
begin
  update outbox_deliveries
  set attempts = attempts + 1,
      status = case when p_ok then 'delivered'
                    when attempts + 1 >= p_max_attempts then 'failed'
                    else 'pending' end,
      last_status_code = p_status_code,
      last_error = p_error,
      updated_at = now()
  where id = p_delivery_id
  returning event_id, status into v_event, v_status;
  if v_status = 'delivered' then
    perform app_outbox_mark_dispatched(v_event);
  end if;
  return v_status;
end $$;

-- Merchant-facing registration. Managers only; the signing secret is generated
-- server-side and returned exactly once.
create or replace function app_register_outbox_webhook(p_actor uuid, p_organization_id uuid, p_url text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_secret text;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  if not is_organization_manager(p_organization_id) then raise exception 'FORBIDDEN'; end if;
  if p_url !~ '^https://' then raise exception 'URL_MUST_BE_HTTPS'; end if;
  v_secret := encode(gen_random_bytes(32), 'hex');
  insert into outbox_webhooks(organization_id, url, secret)
  values (p_organization_id, p_url, v_secret)
  on conflict (organization_id, url) do update set active = true, secret = excluded.secret
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'url', p_url, 'secret', v_secret);
end $$;

create or replace function app_list_outbox_webhooks(p_actor uuid, p_organization_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id, 'url', w.url, 'active', w.active, 'createdAt', w.created_at) order by w.created_at), '[]'::jsonb)
  from outbox_webhooks w
  where w.organization_id = p_organization_id and is_organization_manager(p_organization_id);
$$;

create or replace function app_delete_outbox_webhook(p_actor uuid, p_webhook_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  delete from outbox_webhooks w
  where w.id = p_webhook_id and is_organization_manager(w.organization_id);
end $$;

revoke all on function app_outbox_due_events(integer) from public, authenticated;
revoke all on function app_outbox_webhooks_for_event(uuid) from public, authenticated;
revoke all on function app_outbox_delivery_upsert(uuid,uuid,boolean,integer,text) from public, authenticated;
revoke all on function app_outbox_mark_dispatched(uuid) from public, authenticated;
revoke all on function app_outbox_enqueue_retry(uuid,uuid) from public, authenticated;
revoke all on function app_webhook_delivery_for_job(uuid,uuid) from public, authenticated;
revoke all on function app_webhook_delivery_result(uuid,boolean,integer,text,integer) from public, authenticated;
revoke all on function app_register_outbox_webhook(uuid,uuid,text) from public;
revoke all on function app_list_outbox_webhooks(uuid,uuid) from public;
revoke all on function app_delete_outbox_webhook(uuid,uuid) from public;
grant execute on function app_register_outbox_webhook(uuid,uuid,text) to authenticated;
grant execute on function app_list_outbox_webhooks(uuid,uuid) to authenticated;
grant execute on function app_delete_outbox_webhook(uuid,uuid) to authenticated;
grant execute on function app_outbox_due_events(integer) to service_role;
grant execute on function app_outbox_webhooks_for_event(uuid) to service_role;
grant execute on function app_outbox_delivery_upsert(uuid,uuid,boolean,integer,text) to service_role;
grant execute on function app_outbox_mark_dispatched(uuid) to service_role;
grant execute on function app_outbox_enqueue_retry(uuid,uuid) to service_role;
grant execute on function app_webhook_delivery_for_job(uuid,uuid) to service_role;
grant execute on function app_webhook_delivery_result(uuid,boolean,integer,text,integer) to service_role;
