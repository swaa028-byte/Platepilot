begin;

-- ---------------------------------------------------------------------------
-- Stock counting.
--
-- Stock now arrives with a received purchase order and leaves when a dish is
-- served, but the figure is still only a ledger: what was actually on the
-- shelf is known only when somebody counts it. A stock count snapshots the
-- system quantity when it starts, the staff type in what they actually found,
-- and completing the count writes one adjustment movement per differing
-- ingredient — exactly once, keyed by the count itself.
-- ---------------------------------------------------------------------------

create table stock_counts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, location_id uuid not null,
  status text not null default 'open' check (status in ('open','completed','cancelled')),
  started_by uuid, completed_by uuid,
  created_at timestamptz not null default now(), completed_at timestamptz,
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict
);

create table stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references stock_counts(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  system_milli_units bigint not null default 0,
  counted_milli_units bigint check (counted_milli_units is null or counted_milli_units >= 0),
  unique (stock_count_id, ingredient_id)
);

alter table stock_counts enable row level security;
alter table stock_count_lines enable row level security;

create policy stock_counts_member_read on stock_counts
  for select to authenticated using (is_organization_member(organization_id));
create policy stock_counts_manager_write on stock_counts
  for all to authenticated
  using (is_organization_manager(organization_id))
  with check (is_organization_manager(organization_id));
create policy stock_count_lines_member_read on stock_count_lines
  for select to authenticated using (
    exists (select 1 from stock_counts sc where sc.id = stock_count_id and is_organization_member(sc.organization_id)));
create policy stock_count_lines_manager_write on stock_count_lines
  for all to authenticated
  using (
    exists (select 1 from stock_counts sc where sc.id = stock_count_id and is_organization_manager(sc.organization_id)))
  with check (
    exists (select 1 from stock_counts sc where sc.id = stock_count_id and is_organization_manager(sc.organization_id)));

-- Opens a count and freezes what the ledger believes, per ingredient.
create or replace function app_start_stock_count(p_actor uuid, p_location_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid; v_count_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_organization_id from locations where id = p_location_id;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if not is_organization_manager(v_organization_id) then raise exception 'FORBIDDEN'; end if;

  -- One open count per location at a time: two concurrent counts would both
  -- adjust from different baselines.
  if exists (select 1 from stock_counts where location_id = p_location_id and status = 'open') then
    raise exception 'COUNT_ALREADY_OPEN';
  end if;

  insert into stock_counts(organization_id, location_id, started_by)
    values (v_organization_id, p_location_id, p_actor) returning id into v_count_id;

  insert into stock_count_lines(stock_count_id, ingredient_id, system_milli_units)
    select v_count_id, i.id, coalesce((
      select sum(m.quantity_milli_units) from stock_movements m where m.ingredient_id = i.id
    ), 0)
    from ingredients i where i.location_id = p_location_id;

  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id)
    values (v_organization_id, p_actor, 'stock_count.started', 'stock_count', v_count_id::text);

  return jsonb_build_object('stockCountId', v_count_id, 'lines', coalesce((
    select jsonb_agg(jsonb_build_object(
      'ingredientId', l.ingredient_id, 'name', i.name, 'baseUnit', i.base_unit,
      'systemMilliUnits', l.system_milli_units::text) order by i.name)
    from stock_count_lines l join ingredients i on i.id = l.ingredient_id
    where l.stock_count_id = v_count_id), '[]'::jsonb));
end $$;

-- Completes a count with the quantities that were actually found.
create or replace function app_submit_stock_count(p_actor uuid, p_stock_count_id uuid, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count stock_counts%rowtype; v_line jsonb; v_ingredient uuid;
  v_system bigint; v_counted bigint; v_variance bigint; v_adjusted integer := 0; v_counted_n integer := 0;
begin
  if auth.uid() is null or auth.uid() <> p_actor then raise exception 'FORBIDDEN'; end if;
  select * into v_count from stock_counts where id = p_stock_count_id for update;
  if not found then raise exception 'COUNT_NOT_FOUND'; end if;
  if not is_organization_manager(v_count.organization_id) then raise exception 'FORBIDDEN'; end if;
  if v_count.status <> 'open' then raise exception 'COUNT_NOT_OPEN'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'INVALID_REQUEST'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_ingredient := v_line->>'ingredientId';
    if v_ingredient is null or v_line->>'countedMilliUnits' is null then raise exception 'INVALID_REQUEST'; end if;
    if not exists (select 1 from stock_count_lines l where l.stock_count_id = v_count.id and l.ingredient_id = v_ingredient::uuid) then
      raise exception 'INGREDIENT_NOT_IN_COUNT';
    end if;
    if not (v_line->>'countedMilliUnits') ~ '^[0-9]+$' then raise exception 'INVALID_REQUEST'; end if;
    v_counted := (v_line->>'countedMilliUnits')::bigint;
    update stock_count_lines set counted_milli_units = v_counted
      where stock_count_id = v_count.id and ingredient_id = v_ingredient::uuid;
    v_counted_n := v_counted_n + 1;
  end loop;

  -- One adjustment movement per differing ingredient, keyed so a retried
  -- submission can never double-adjust.
  for v_line in
    select jsonb_build_object('ingredientId', l.ingredient_id, 'variance', l.counted_milli_units - l.system_milli_units)
    from stock_count_lines l where l.stock_count_id = v_count.id and l.counted_milli_units is not null
  loop
    v_variance := (v_line->>'variance')::bigint;
    if v_variance <> 0 then
      insert into stock_movements(organization_id, location_id, ingredient_id, event_id, kind, quantity_milli_units, actor_id)
        values (v_count.organization_id, v_count.location_id, (v_line->>'ingredientId')::uuid,
          'stock_count:' || v_count.id::text || ':' || (v_line->>'ingredientId'), 'count_adjustment', v_variance, p_actor)
        on conflict (event_id) do nothing;
      if found then v_adjusted := v_adjusted + 1; end if;
    end if;
  end loop;

  update stock_counts set status = 'completed', completed_by = p_actor, completed_at = now() where id = v_count.id;
  insert into audit_events(organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_count.organization_id, p_actor, 'stock_count.completed', 'stock_count', v_count.id::text,
      jsonb_build_object('counted', v_counted_n, 'adjusted', v_adjusted));

  return jsonb_build_object('stockCountId', v_count.id, 'status', 'completed',
    'counted', v_counted_n, 'adjusted', v_adjusted, 'variance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ingredientId', l.ingredient_id, 'name', i.name, 'baseUnit', i.base_unit,
        'systemMilliUnits', l.system_milli_units::text, 'countedMilliUnits', l.counted_milli_units::text,
        'varianceMilliUnits', (l.counted_milli_units - l.system_milli_units)::text) order by i.name)
      from stock_count_lines l join ingredients i on i.id = l.ingredient_id
      where l.stock_count_id = v_count.id and l.counted_milli_units is not null
        and l.counted_milli_units <> l.system_milli_units), '[]'::jsonb));
end $$;

-- The count history with its variances, for the shrinkage view.
create or replace function app_list_stock_counts(p_actor uuid, p_location_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'stockCountId', sc.id, 'status', sc.status, 'createdAt', sc.created_at, 'completedAt', sc.completed_at,
    'lines', (select count(*) from stock_count_lines l where l.stock_count_id = sc.id),
    'varianceLines', (select count(*) from stock_count_lines l where l.stock_count_id = sc.id
      and l.counted_milli_units is not null and l.counted_milli_units <> l.system_milli_units)
  ) order by sc.created_at desc), '[]'::jsonb)
  from stock_counts sc
  where sc.location_id = p_location_id and is_organization_member(sc.organization_id);
$$;

revoke all on function app_start_stock_count(uuid, uuid) from public;
revoke all on function app_submit_stock_count(uuid, uuid, jsonb) from public;
revoke all on function app_list_stock_counts(uuid, uuid) from public;
grant execute on function app_start_stock_count(uuid, uuid) to authenticated;
grant execute on function app_submit_stock_count(uuid, uuid, jsonb) to authenticated;
grant execute on function app_list_stock_counts(uuid, uuid) to authenticated;

commit;
