-- PlatePilot · platform admin check, without guessing the session role name
--
-- The first version allowed the names 'postgres' and 'supabase_admin'. The
-- Supabase SQL editor does not always connect under either name, so the
-- reports raised FORBIDDEN in the one place the operator runs them.
--
-- What actually distinguishes "I am inside the database" from "I am an API
-- request" is privilege, not a name: a superuser session can already read
-- every table and bypass row level security, so the reports are its to run.
-- A request through PostgREST never is a superuser, and still has to match a
-- row in platform_admins.
--
-- Safe to re-run.

create or replace function is_platform_admin(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
    -- An app or API request: the claim must be a known operator.
    when p_user_id is not null then
      exists (select 1 from platform_admins where user_id = p_user_id)
    -- A direct database session (SQL editor, psql, migrations).
    when coalesce((select r.rolsuper from pg_roles r where r.rolname = session_user), false) then true
    when session_user in ('postgres', 'supabase_admin', 'service_role') then true
    else false
  end;
$$;

revoke all on function is_platform_admin(uuid) from public;
grant execute on function is_platform_admin(uuid) to authenticated, service_role;

-- Diagnostic: what does this session look like? Run it in the SQL editor and
-- the answers explain any FORBIDDEN you see.
create or replace function app_whoami()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'session_user', session_user,
    'current_user', current_user,
    'is_superuser', coalesce((select r.rolsuper from pg_roles r where r.rolname = session_user), false),
    'auth_uid', auth.uid(),
    'is_platform_admin', is_platform_admin()
  );
$$;

grant execute on function app_whoami() to authenticated, service_role;
