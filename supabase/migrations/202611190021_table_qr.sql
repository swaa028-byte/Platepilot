begin;

-- ---------------------------------------------------------------------------
-- Table QR codes.
--
-- The QR itself is derived data — the menu URL plus the table id — so no
-- storage is needed. What the storefront does need is a way to turn a table
-- id from a scanned code back into a name it can show the guest. The table
-- id is the capability: it only reveals the table's name.
-- ---------------------------------------------------------------------------

create or replace function app_table_label(p_table_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('name', rt.name, 'locationId', rt.location_id)
  from restaurant_tables rt
  where rt.id = p_table_id;
$$;

revoke all on function app_table_label(uuid) from public;
grant execute on function app_table_label(uuid) to anon, authenticated, service_role;

commit;
