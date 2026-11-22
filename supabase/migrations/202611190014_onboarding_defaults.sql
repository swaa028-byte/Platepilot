-- Onboarding ends in a working restaurant.
--
-- app_create_merchant used to create a location with ordering disabled and no
-- service settings, so a merchant who finished the wizard could not take a
-- single order until they discovered the settings page. A new workspace now
-- opens for business immediately, with honest defaults the merchant can change:
-- every day 09:00-21:00, 20 minutes of prep, tax left at 0 until they set it.

create or replace function app_create_merchant(
  p_name text, p_address text, p_legal_country text, p_currency text, p_timezone text, p_locale text, p_place_id text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_location_id uuid; v_slug text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_currency !~ '^[A-Z]{3}$' or p_locale !~ '^(en|fr|es|pt|ar)$' then raise exception 'INVALID_REQUEST'; end if;

  insert into organizations(name, legal_country, default_locale) values (p_name, p_legal_country, p_locale) returning id into v_organization_id;

  -- A readable slug with a short suffix taken from the identifier, so two
  -- restaurants with the same name still get different addresses.
  v_slug := trim(both '-' from lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g')));
  if v_slug = '' then v_slug := 'restaurant'; end if;
  v_slug := left(v_slug, 60) || '-' || substr(replace(v_organization_id::text, '-', ''), 1, 6);

  insert into locations(organization_id, name, address, timezone, currency, slug, ordering_enabled, service_settings)
    values (v_organization_id, p_name, p_address, p_timezone, p_currency, v_slug, false, jsonb_build_object(
      'openingHours', jsonb_build_object(
        '0', jsonb_build_array(jsonb_build_array('09:00', '21:00')),
        '1', jsonb_build_array(jsonb_build_array('09:00', '21:00')),
        '2', jsonb_build_array(jsonb_build_array('09:00', '21:00')),
        '3', jsonb_build_array(jsonb_build_array('09:00', '21:00')),
        '4', jsonb_build_array(jsonb_build_array('09:00', '21:00')),
        '5', jsonb_build_array(jsonb_build_array('09:00', '21:00')),
        '6', jsonb_build_array(jsonb_build_array('09:00', '21:00'))
      ),
      'prepMinutes', 20
    ))
    returning id into v_location_id;

  insert into memberships(organization_id, user_id, role) values (v_organization_id, auth.uid(), 'owner');
  if p_place_id is not null then
    insert into external_listings(organization_id, location_id, external_id, linked_by) values (v_organization_id, v_location_id, p_place_id, auth.uid());
  end if;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id) values (v_organization_id, auth.uid(), 'merchant.created', 'organization', v_organization_id::text);
  return jsonb_build_object('organizationId', v_organization_id, 'locationId', v_location_id, 'slug', v_slug);
end $$;

revoke all on function app_create_merchant(text,text,text,text,text,text,text) from public;
grant execute on function app_create_merchant(text,text,text,text,text,text,text) to authenticated;
