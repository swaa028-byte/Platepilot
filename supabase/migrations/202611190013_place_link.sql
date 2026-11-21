-- Linking a location to its Google listing.
--
-- Discovery finds a restaurant by name, city and address; selecting a branch
-- stores its Google Place ID against the location. The storefront already
-- reads this link for schema.org structured data. The link is data, not
-- ownership: it says "this listing describes this place", and it can be
-- removed. Ownership of a Google Business Profile is a separate product
-- decision that needs Google's own verification flow.

create or replace function app_link_place(p_actor uuid, p_location_id uuid, p_place_id text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid; v_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  if p_place_id !~ '^ChIJ[A-Za-z0-9_-]{10,}$' then raise exception 'INVALID_PLACE_ID'; end if;
  insert into external_listings(organization_id, location_id, provider, external_id, linked_by)
  values (v_organization_id, p_location_id, 'google_places', p_place_id, p_actor)
  on conflict (provider, location_id) do update
    set external_id = excluded.external_id, linked_by = excluded.linked_by, linked_at = now()
  returning id into v_id;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_organization_id, p_actor, 'place.linked', 'location', p_location_id::text,
      jsonb_build_object('provider', 'google_places', 'placeId', p_place_id));
  return v_id;
end $$;

create or replace function app_unlink_place(p_actor uuid, p_location_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;
  delete from external_listings where location_id = p_location_id and provider = 'google_places';
end $$;

create or replace function app_get_linked_place(p_actor uuid, p_location_id uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select e.external_id from external_listings e
  where e.location_id = p_location_id and e.provider = 'google_places'
    and is_organization_member(e.organization_id) and auth.uid() = p_actor;
$$;

revoke all on function app_link_place(uuid,uuid,text) from public;
revoke all on function app_unlink_place(uuid,uuid) from public;
revoke all on function app_get_linked_place(uuid,uuid) from public;
grant execute on function app_link_place(uuid,uuid,text) to authenticated;
grant execute on function app_unlink_place(uuid,uuid) to authenticated;
grant execute on function app_get_linked_place(uuid,uuid) to authenticated;
