-- Custom domains.
--
-- A merchant can serve their storefront from their own domain. The flow is the
-- honest one: they claim a domain, the app tells them exactly which DNS record
-- to create, and verification is a real DNS lookup — not a checkbox. The host
-- (Netlify) is configured by the operator once a domain verifies; the
-- application never holds hosting credentials.

create table custom_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  domain text not null unique,
  status text not null default 'pending' check (status in ('pending','verified','failed')),
  verification_token text not null default encode(gen_random_bytes(16), 'hex'),
  verified_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create or replace function app_normalize_domain(p_domain text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select lower(btrim(regexp_replace(coalesce(p_domain, ''), '^https?://', ''), './'));
$$;

create or replace function app_list_custom_domains(p_actor uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'domain', d.domain, 'status', d.status, 'verificationToken', d.verification_token,
    'verifiedAt', d.verified_at, 'lastError', d.last_error, 'createdAt', d.created_at
  ) order by d.created_at), '[]'::jsonb)
  from custom_domains d
  where exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.organization_id = d.organization_id and m.role in ('owner','manager')
  ) and auth.uid() = p_actor;
$$;

create or replace function app_add_custom_domain(p_actor uuid, p_domain text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid; v_domain text; v_row custom_domains%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select m.organization_id into v_organization_id from memberships m
  where m.user_id = auth.uid() and m.role in ('owner','manager')
  order by m.role limit 1;
  if v_organization_id is null then raise exception 'FORBIDDEN'; end if;
  v_domain := app_normalize_domain(p_domain);
  if v_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
     or char_length(v_domain) > 253 or v_domain like '%.localhost' then
    raise exception 'INVALID_DOMAIN';
  end if;
  insert into custom_domains(organization_id, domain) values (v_organization_id, v_domain)
  on conflict (domain) do nothing
  returning * into v_row;
  if not found then
    select * into v_row from custom_domains where domain = v_domain;
    if v_row.organization_id <> v_organization_id then raise exception 'DOMAIN_TAKEN'; end if;
  end if;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, p_actor, 'domain.claimed', 'custom_domain', v_row.id::text,
      jsonb_build_object('domain', v_domain));
  return jsonb_build_object('id', v_row.id, 'domain', v_row.domain, 'status', v_row.status,
    'verificationToken', v_row.verification_token);
end $$;

-- The outcome of a server-side DNS check. The application performs the lookup
-- (databases should not make HTTP calls); this only records what was found.
create or replace function app_set_custom_domain_status(
  p_actor uuid, p_domain_id uuid, p_ok boolean, p_detail text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row custom_domains%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select * into v_row from custom_domains where id = p_domain_id for update;
  if not found then raise exception 'DOMAIN_NOT_FOUND'; end if;
  if not exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.organization_id = v_row.organization_id and m.role in ('owner','manager')
  ) then raise exception 'FORBIDDEN'; end if;
  update custom_domains
  set status = case when p_ok then 'verified' else 'failed' end,
      verified_at = case when p_ok then now() else verified_at end,
      last_checked_at = now(),
      last_error = case when p_ok then null else coalesce(p_detail, 'DNS_CHECK_FAILED') end
  where id = p_domain_id
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'domain', v_row.domain, 'status', v_row.status, 'lastError', v_row.last_error);
end $$;

create or replace function app_delete_custom_domain(p_actor uuid, p_domain_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from custom_domains where id = p_domain_id;
  if not found then raise exception 'DOMAIN_NOT_FOUND'; end if;
  if not exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.organization_id = v_organization_id and m.role in ('owner','manager')
  ) then raise exception 'FORBIDDEN'; end if;
  delete from custom_domains where id = p_domain_id;
end $$;

revoke all on function app_normalize_domain(text) from public;
revoke all on function app_list_custom_domains(uuid) from public;
revoke all on function app_add_custom_domain(uuid,text) from public;
revoke all on function app_set_custom_domain_status(uuid,uuid,boolean,text) from public;
revoke all on function app_delete_custom_domain(uuid,uuid) from public;
grant execute on function app_list_custom_domains(uuid) to authenticated;
grant execute on function app_add_custom_domain(uuid,text) to authenticated;
grant execute on function app_set_custom_domain_status(uuid,uuid,boolean,text) to authenticated;
grant execute on function app_delete_custom_domain(uuid,uuid) to authenticated;
