-- Storefront marketing campaigns.
--
-- Promotions (discount codes with usage limits) already exist and are enforced
-- server-side at order time. What was missing is the surface that tells
-- customers a promotion exists: a scheduled announcement on the storefront.
-- A campaign is a popup or banner with a headline, body and optional call to
-- action that can advertise a discount code, runs inside a window, and is
-- rendered from the merchant's own data.

create table marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  kind text not null default 'popup' check (kind in ('popup','banner')),
  headline text not null check (btrim(headline) <> '' and char_length(headline) <= 120),
  body text not null default '' check (char_length(body) <= 400),
  cta_label text check (cta_label is null or (btrim(cta_label) <> '' and char_length(cta_label) <= 40)),
  cta_href text check (cta_href is null or cta_href ~ '^/[^"]*$'),
  discount_code text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict
);

-- The campaign a storefront shows right now: active, inside its window, most
-- recently created. Service role only; the storefront server renders it.
create or replace function app_active_campaign(p_location_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', c.id, 'kind', c.kind, 'headline', c.headline, 'body', c.body,
    'ctaLabel', c.cta_label, 'ctaHref', c.cta_href, 'discountCode', c.discount_code)
  from marketing_campaigns c
  where c.location_id = p_location_id and c.active
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at >= now())
  order by c.created_at desc
  limit 1;
$$;

create or replace function app_list_campaigns(p_actor uuid, p_location_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'kind', c.kind, 'headline', c.headline, 'body', c.body,
    'ctaLabel', c.cta_label, 'ctaHref', c.cta_href, 'discountCode', c.discount_code,
    'startsAt', c.starts_at, 'endsAt', c.ends_at, 'active', c.active) order by c.created_at desc), '[]'::jsonb)
  from marketing_campaigns c
  where c.location_id = p_location_id and is_organization_member(c.organization_id);
$$;

create or replace function app_upsert_campaign(
  p_actor uuid, p_location_id uuid, p_campaign_id uuid,
  p_kind text, p_headline text, p_body text,
  p_cta_label text, p_cta_href text, p_discount_code text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_active boolean
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid; v_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  if p_kind not in ('popup','banner') then raise exception 'INVALID_REQUEST'; end if;
  if p_cta_href is not null and p_cta_label is null then raise exception 'INVALID_REQUEST'; end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at < p_starts_at then raise exception 'INVALID_REQUEST'; end if;
  if p_discount_code is not null and not exists (
    select 1 from promotions where location_id = p_location_id and code = p_discount_code) then
    raise exception 'PROMOTION_NOT_FOUND';
  end if;
  if p_campaign_id is null then
    insert into marketing_campaigns(organization_id, location_id, kind, headline, body, cta_label, cta_href, discount_code, starts_at, ends_at, active)
    values (v_organization_id, p_location_id, p_kind, btrim(p_headline), coalesce(p_body, ''), p_cta_label, p_cta_href, p_discount_code, p_starts_at, p_ends_at, coalesce(p_active, true))
    returning id into v_id;
  else
    update marketing_campaigns c
    set kind = p_kind, headline = btrim(p_headline), body = coalesce(p_body, ''), cta_label = p_cta_label,
        cta_href = p_cta_href, discount_code = p_discount_code, starts_at = p_starts_at, ends_at = p_ends_at,
        active = coalesce(p_active, c.active)
    where c.id = p_campaign_id and c.location_id = p_location_id
    returning c.id into v_id;
    if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  end if;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_organization_id, p_actor, 'campaign.saved', 'marketing_campaign', v_id::text,
    jsonb_build_object('kind', p_kind, 'headline', btrim(p_headline)));
  return v_id;
end $$;

create or replace function app_delete_campaign(p_actor uuid, p_campaign_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from marketing_campaigns where id = p_campaign_id;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  delete from marketing_campaigns where id = p_campaign_id;
end $$;

revoke all on function app_active_campaign(uuid) from public, authenticated;
revoke all on function app_list_campaigns(uuid,uuid) from public;
revoke all on function app_upsert_campaign(uuid,uuid,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean) from public;
revoke all on function app_delete_campaign(uuid,uuid) from public;
grant execute on function app_active_campaign(uuid) to service_role;
grant execute on function app_list_campaigns(uuid,uuid) to authenticated;
grant execute on function app_upsert_campaign(uuid,uuid,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean) to authenticated;
grant execute on function app_delete_campaign(uuid,uuid) to authenticated;
