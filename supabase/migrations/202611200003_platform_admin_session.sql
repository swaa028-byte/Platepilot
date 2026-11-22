-- PlatePilot · platform admin check that also works from the SQL editor
--
-- is_platform_admin() reads auth.uid(), which is NULL in the Supabase SQL
-- editor and in psql — so the revenue and settlement reports raised FORBIDDEN
-- exactly where the operator wants to run them. A direct database session can
-- already bypass row level security, so it is allowed; a request arriving
-- through the API can never present that session and still has to match a row
-- in platform_admins.
--
-- Safe to re-run.

create or replace function is_platform_admin(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
    -- An API or app request: the claim must be a known operator.
    when p_user_id is not null then
      exists (select 1 from platform_admins where user_id = p_user_id)
    -- A direct database session (SQL editor, psql, migrations).
    when session_user in ('postgres', 'supabase_admin') then true
    else false
  end;
$$;

revoke all on function is_platform_admin(uuid) from public;
grant execute on function is_platform_admin(uuid) to authenticated, service_role;
