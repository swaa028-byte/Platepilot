begin;

-- Refunds are tenant scoped like every other operational table. The column is
-- added before the policies below so tenant isolation can be enforced on the
-- table directly instead of through a join to the payment attempt.
alter table refunds add column if not exists organization_id uuid references organizations(id) on delete restrict;
alter table refunds add column if not exists location_id uuid;
update refunds r
   set organization_id = pa.organization_id,
       location_id = pa.location_id
  from payment_attempts pa
 where pa.id = r.payment_attempt_id and r.organization_id is null;
alter table refunds alter column organization_id set not null;
alter table refunds add constraint refunds_location_fk
  foreign key (organization_id, location_id) references locations(organization_id, id) on delete restrict;

create or replace function is_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from memberships where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','manager','host','server','kitchen','accountant'));
$$;

create or replace function is_organization_manager(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from memberships where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','manager'));
$$;

revoke all on function is_organization_member(uuid) from public;
revoke all on function is_organization_manager(uuid) from public;
grant execute on function is_organization_member(uuid) to authenticated;
grant execute on function is_organization_manager(uuid) to authenticated;

do $$ declare table_name text;
begin
  foreach table_name in array array[
    'organizations','locations','memberships','external_listings','catalog_categories','menu_items','price_books','item_prices','menu_translations',
    'restaurant_tables','floor_plans','reservations','orders','order_items','payment_connections','payment_attempts','payment_events','refunds',
    'kitchen_tickets','outbox_events','jobs','cash_shifts','ingredients','stock_movements','customers','consent_events','loyalty_ledger',
    'delivery_assignments','integration_accounts','audit_events'
  ] loop execute format('alter table public.%I enable row level security', table_name); end loop;
end $$;

create policy memberships_self_read on memberships for select to authenticated using (user_id=auth.uid() or is_organization_manager(organization_id));
create policy organizations_member_read on organizations for select to authenticated using (is_organization_member(id));
create policy organizations_manager_update on organizations for update to authenticated using (is_organization_manager(id)) with check (is_organization_manager(id));

do $$ declare table_name text;
begin
  foreach table_name in array array[
    'locations','external_listings','catalog_categories','menu_items','price_books','restaurant_tables','floor_plans','reservations','orders',
    'payment_connections','payment_attempts','refunds','kitchen_tickets','cash_shifts','ingredients','stock_movements','delivery_assignments','integration_accounts'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (is_organization_member(organization_id))', table_name||'_member_read', table_name);
  end loop;
  foreach table_name in array array[
    'locations','external_listings','catalog_categories','menu_items','price_books','restaurant_tables','floor_plans','reservations',
    'cash_shifts','ingredients','stock_movements','delivery_assignments','integration_accounts'
  ] loop
    execute format('create policy %I on public.%I for all to authenticated using (is_organization_manager(organization_id)) with check (is_organization_manager(organization_id))', table_name||'_manager_write', table_name);
  end loop;
end $$;

create policy order_items_staff_read on order_items for select to authenticated using (
  exists(select 1 from orders o where o.id=order_id and is_organization_member(o.organization_id))
);
create policy item_prices_staff_read on item_prices for select to authenticated using (
  exists(select 1 from price_books p where p.id=price_book_id and is_organization_member(p.organization_id))
);
create policy menu_translations_manager_all on menu_translations for all to authenticated using (
  exists(select 1 from menu_items m where m.id=menu_item_id and is_organization_manager(m.organization_id))
) with check (
  exists(select 1 from menu_items m where m.id=menu_item_id and is_organization_manager(m.organization_id))
);
create policy customers_manager_read on customers for select to authenticated using (is_organization_manager(organization_id));
create policy consent_events_manager_read on consent_events for select to authenticated using (
  exists(select 1 from customers c where c.id=customer_id and is_organization_manager(c.organization_id))
);
create policy loyalty_ledger_manager_read on loyalty_ledger for select to authenticated using (
  exists(select 1 from customers c where c.id=customer_id and is_organization_manager(c.organization_id))
);
create policy audit_events_manager_read on audit_events for select to authenticated using (is_organization_manager(organization_id));

revoke all on payment_events, outbox_events, jobs from anon, authenticated;
revoke insert, update, delete on orders, order_items, payment_attempts, payment_connections, refunds, kitchen_tickets, audit_events from anon, authenticated;

commit;
