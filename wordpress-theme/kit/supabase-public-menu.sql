-- PlatePilot · public menu read function
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query)
-- after the PlatePilot schema migrations have been applied.
--
-- Why it exists: the WordPress theme holds the project's *anon public* key.
-- Anonymous visitors must be able to read a published menu and nothing
-- else. The app's own app_published_menu() stays private (service_role);
-- this thin wrapper exposes a slug-addressed version to anon, so no
-- dashboard, order, customer or payment data becomes reachable.
--
-- Safe to re-run.

create or replace function public.public_menu(p_slug text, p_locale text default 'en')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_location_id uuid;
  v_menu jsonb;
begin
  select id into v_location_id
  from locations
  where slug = p_slug
  limit 1;

  if v_location_id is null then
    return null;
  end if;

  -- Reuse the app's own published-menu projection: the same payload the
  -- storefront page renders, so prices and availability never disagree.
  select app_published_menu(v_location_id, coalesce(nullif(p_locale, ''), 'en')) into v_menu;

  return v_menu;
end;
$$;

revoke all on function public.public_menu(text, text) from public;
grant execute on function public.public_menu(text, text) to anon;
grant execute on function public.public_menu(text, text) to authenticated;

-- Quick check once the theme is configured (replace the slug):
--   select public.public_menu('la-divine-eden', 'en');
