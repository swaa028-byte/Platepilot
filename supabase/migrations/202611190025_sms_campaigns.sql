begin;

-- ---------------------------------------------------------------------------
-- SMS marketing campaigns.
--
-- Consent first: a phone number enters the marketing audience only when a
-- staff member records it together with the customer's verbal opt-in, and the
-- consent event is written immutably before any message can be queued. A
-- campaign is a draft until a manager sends it; sending snapshots the
-- audience once, one job per recipient, so a retried send cannot message
-- anyone twice.
-- ---------------------------------------------------------------------------

alter table consent_events drop constraint consent_events_channel_check;
alter table consent_events add constraint consent_events_channel_check
  check (channel in ('email','whatsapp','sms'));

alter table customers add column if not exists display_name text;
alter table customers add column if not exists sms_phone text;
alter table customers add column if not exists sms_opt_in boolean not null default false;
create unique index if not exists customers_org_display_name
  on customers(organization_id, lower(display_name)) where display_name is not null;

create table sms_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  body text not null check (char_length(btrim(body)) between 1 and 320),
  status text not null default 'draft' check (status in ('draft','sent','cancelled')),
  sent_at timestamptz, sent_by uuid, created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict
);

create table sms_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references sms_campaigns(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  phone text not null,
  job_id uuid,
  sent_at timestamptz,
  unique (campaign_id, customer_id)
);

alter table sms_campaigns enable row level security;
alter table sms_campaign_recipients enable row level security;
create policy sms_campaigns_member_read on sms_campaigns
  for select to authenticated using (is_organization_member(organization_id));
create policy sms_campaigns_manager_write on sms_campaigns
  for all to authenticated
  using (is_organization_manager(organization_id))
  with check (is_organization_manager(organization_id));
create policy sms_campaign_recipients_member_read on sms_campaign_recipients
  for select to authenticated using (
    exists (select 1 from sms_campaigns sc where sc.id = campaign_id and is_organization_member(sc.organization_id)));

-- Records what the customer said: their marketing phone, in or out. The
-- consent event is written for both directions, so the trail never depends on
-- a flag alone.
create or replace function app_record_sms_consent(
  p_actor uuid, p_organization_id uuid, p_name text, p_phone text, p_opt_in boolean
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_customer_id uuid; v_clean text;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  if not is_organization_member(p_organization_id) then raise exception 'FORBIDDEN'; end if;
  if p_name is null or btrim(p_name) = '' or char_length(btrim(p_name)) > 120 then raise exception 'INVALID_REQUEST'; end if;
  v_clean := btrim(coalesce(p_phone, ''));
  if p_opt_in and (v_clean = '' or v_clean !~ '^\+[0-9]{5,20}$') then raise exception 'INVALID_PHONE'; end if;

  insert into customers(organization_id, display_name, sms_phone, sms_opt_in)
    values (p_organization_id, btrim(p_name), case when p_opt_in then v_clean end, p_opt_in)
    on conflict (organization_id, lower(display_name)) where display_name is not null do update
      set sms_phone = case when p_opt_in then v_clean else customers.sms_phone end,
          sms_opt_in = p_opt_in
    returning id into v_customer_id;

  insert into consent_events(customer_id, channel, purpose, action, source)
    values (v_customer_id, 'sms', 'marketing', case when p_opt_in then 'opt_in' else 'opt_out' end, 'staff');

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (p_organization_id, p_actor, 'customer.sms_consent', 'customer', v_customer_id::text,
      jsonb_build_object('optIn', p_opt_in));

  return jsonb_build_object('customerId', v_customer_id, 'optIn', p_opt_in);
end $$;

-- The audience a campaign would reach: everyone who opted in and still has a
-- number. The phone is shown to staff who may manage consent; it is not a
-- secret from the people who recorded it.
create or replace function app_list_sms_audience(p_actor uuid, p_location_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'customerId', c.id, 'name', c.display_name, 'phone', c.sms_phone, 'optedInAt', c.created_at)
    order by c.display_name), '[]'::jsonb)
  from customers c
  where c.organization_id = (select organization_id from locations where id = p_location_id)
    and c.sms_opt_in and c.sms_phone is not null and c.deleted_at is null
    and is_organization_member(c.organization_id);
$$;

create or replace function app_list_sms_campaigns(p_actor uuid, p_location_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaignId', sc.id, 'name', sc.name, 'body', sc.body, 'status', sc.status,
    'sentAt', sc.sent_at, 'recipients', (
      select count(*) from sms_campaign_recipients r where r.campaign_id = sc.id),
    'delivered', (
      select count(*) from sms_campaign_recipients r
        join jobs j on j.id = r.job_id
        where r.campaign_id = sc.id and j.status = 'completed')
    ) order by sc.created_at desc), '[]'::jsonb)
  from sms_campaigns sc
  where sc.location_id = p_location_id and is_organization_member(sc.organization_id);
$$;

create or replace function app_upsert_sms_campaign(
  p_actor uuid, p_location_id uuid, p_campaign_id uuid, p_name text, p_body text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  if p_name is null or btrim(p_name) = '' or char_length(btrim(p_name)) > 60 then raise exception 'INVALID_REQUEST'; end if;
  if p_body is null or btrim(p_body) = '' or char_length(btrim(p_body)) > 320 then raise exception 'INVALID_REQUEST'; end if;

  if p_campaign_id is null then
    insert into sms_campaigns(organization_id, location_id, name, body)
      values (v_organization_id, p_location_id, btrim(p_name), btrim(p_body))
      returning id into v_id;
  else
    update sms_campaigns
       set name = btrim(p_name), body = btrim(p_body)
     where id = p_campaign_id and location_id = p_location_id and status = 'draft'
     returning id into v_id;
    if not found then raise exception 'CAMPAIGN_NOT_DRAFT'; end if;
  end if;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, p_actor, 'sms_campaign.saved', 'sms_campaign', v_id::text,
      jsonb_build_object('name', btrim(p_name)));
  return jsonb_build_object('campaignId', v_id, 'name', btrim(p_name), 'body', btrim(p_body));
end $$;

-- Sends a draft. The audience is snapshotted once; each recipient gets one
-- job, and the same campaign can never enqueue for the same person twice.
create or replace function app_send_sms_campaign(p_actor uuid, p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_campaign sms_campaigns%rowtype;
  v_recipient sms_campaign_recipients%rowtype;
  v_job_id uuid; v_enqueued integer := 0;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select * into v_campaign from sms_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if not is_organization_manager(v_campaign.organization_id) then raise exception 'FORBIDDEN'; end if;
  if v_campaign.status <> 'draft' then raise exception 'CAMPAIGN_NOT_DRAFT'; end if;

  insert into sms_campaign_recipients(campaign_id, customer_id, phone)
    select v_campaign.id, c.id, c.sms_phone
      from customers c
      where c.organization_id = v_campaign.organization_id
        and c.sms_opt_in and c.sms_phone is not null and c.deleted_at is null
    on conflict (campaign_id, customer_id) do nothing;

  for v_recipient in select * from sms_campaign_recipients
      where campaign_id = v_campaign.id and job_id is null
  loop
    insert into jobs(kind, payload)
      values ('sms.send', jsonb_build_object(
        'to', v_recipient.phone, 'body', v_campaign.body, 'campaignId', v_campaign.id))
      returning id into v_job_id;
    update sms_campaign_recipients set job_id = v_job_id where id = v_recipient.id;
    v_enqueued := v_enqueued + 1;
  end loop;

  update sms_campaigns set status = 'sent', sent_at = now(), sent_by = p_actor
    where id = v_campaign.id;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_campaign.organization_id, p_actor, 'sms_campaign.sent', 'sms_campaign', v_campaign.id::text,
      jsonb_build_object('recipients', v_enqueued));
  return jsonb_build_object('campaignId', v_campaign.id, 'status', 'sent', 'enqueued', v_enqueued);
end $$;

revoke all on function app_record_sms_consent(uuid, uuid, text, text, boolean) from public;
grant execute on function app_record_sms_consent(uuid, uuid, text, text, boolean) to authenticated;
revoke all on function app_list_sms_audience(uuid, uuid) from public;
grant execute on function app_list_sms_audience(uuid, uuid) to authenticated;
revoke all on function app_list_sms_campaigns(uuid, uuid) from public;
grant execute on function app_list_sms_campaigns(uuid, uuid) to authenticated;
revoke all on function app_upsert_sms_campaign(uuid, uuid, uuid, text, text) from public;
grant execute on function app_upsert_sms_campaign(uuid, uuid, uuid, text, text) to authenticated;
revoke all on function app_send_sms_campaign(uuid, uuid) from public;
grant execute on function app_send_sms_campaign(uuid, uuid) to authenticated;

commit;
