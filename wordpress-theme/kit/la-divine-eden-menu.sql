-- La Divine Eden — signature menu, ready to load.
--
-- Run in the Supabase SQL editor. It writes the menu directly (the publishing
-- function refuses anybody who is not the signed-in owner, which the SQL editor
-- is not), so it also archives whatever price book is published now: the old
-- menu stops being served the moment this runs, and this one takes its place.
--
-- Prices are ZAR minor units: 7000 = R70.00. Change them here, once.
-- Photos: upload them in WordPress (Media → Add New), then set v_images below to
-- the URL WordPress gives you and keep the file names listed per item.

do $$
declare
  v_slug   text := 'divine-eden-b56906';
  -- Where the photos live. WordPress media is fine: it is already public.
  v_images text := 'https://platepilot.ct.ws/wp-content/uploads/la-divine-eden';

  v_org      uuid;
  v_location uuid;
  v_book     uuid;
  v_category uuid;
  v_item     uuid;
begin
  select organization_id, id into v_org, v_location
  from locations where slug = v_slug;

  if v_location is null then
    raise exception 'No location with slug %. Check select slug from locations;', v_slug;
  end if;

  -- The published menu is replaced, not edited.
  update price_books set status = 'archived'
  where location_id = v_location and status = 'published';

  insert into price_books (organization_id, location_id, currency, status, published_at)
  select v_org, v_location, l.currency, 'published', now() from locations l where l.id = v_location
  returning id into v_book;

  ------------------------------------------------------------------ mains
  insert into catalog_categories (organization_id, location_id, name, sort_order)
  values (v_org, v_location, 'Signature Mains', 1)
  on conflict (location_id, name) do update set sort_order = excluded.sort_order
  returning id into v_category;

  -- Spinach Delight — R70, choice of fish or chicken, pap or rice.
  insert into menu_items (organization_id, location_id, category_id, name, description, allergens, available, image_url)
  values (v_org, v_location, v_category, 'Spinach Delight',
    'Slow-simmered green spinach infused with traditional spices and a rich depth of flavour. Choice of fish or chicken, served with pap or rice.',
    '{}', true, v_images || '/spinach-delight.jpg')
  on conflict (category_id, name) do update set description = excluded.description, available = true, image_url = excluded.image_url, version = menu_items.version + 1
  returning id into v_item;
  insert into item_prices (price_book_id, menu_item_id, amount_minor) values (v_book, v_item, 7000);

  -- Cassava Leaves (Pondu) — R70.
  insert into menu_items (organization_id, location_id, category_id, name, description, allergens, available, image_url)
  values (v_org, v_location, v_category, 'Cassava Leaves (Pondu)',
    'Central African cassava leaves cooked smooth in a deeply savoury, comforting sauce. Choice of fish or chicken, served with pap or rice.',
    '{}', true, v_images || '/cassava-leaves.jpg')
  on conflict (category_id, name) do update set description = excluded.description, available = true, image_url = excluded.image_url, version = menu_items.version + 1
  returning id into v_item;
  insert into item_prices (price_book_id, menu_item_id, amount_minor) values (v_book, v_item, 7000);

  -- Fumbwa Special — R70.
  insert into menu_items (organization_id, location_id, category_id, name, description, allergens, available, image_url)
  values (v_org, v_location, v_category, 'Fumbwa Special',
    'Wild spinach prepared in an aromatic traditional sauce with a delicate tangy finish. Choice of fish or chicken, served with pap or rice.',
    '{}', true, v_images || '/fumbwa.jpg')
  on conflict (category_id, name) do update set description = excluded.description, available = true, image_url = excluded.image_url, version = menu_items.version + 1
  returning id into v_item;
  insert into item_prices (price_book_id, menu_item_id, amount_minor) values (v_book, v_item, 7000);

  -- Okra Sauce Gumbo — R70.
  insert into menu_items (organization_id, location_id, category_id, name, description, allergens, available, image_url)
  values (v_org, v_location, v_category, 'Okra Sauce Gumbo',
    'Classic okra in a rich savoury sauce: smooth, hearty and deeply satisfying. Choice of fish or chicken, served with pap or rice.',
    '{}', true, v_images || '/okra-gumbo.jpg')
  on conflict (category_id, name) do update set description = excluded.description, available = true, image_url = excluded.image_url, version = menu_items.version + 1
  returning id into v_item;
  insert into item_prices (price_book_id, menu_item_id, amount_minor) values (v_book, v_item, 7000);

  -- African Beans Plate — R80, served with rice.
  insert into menu_items (organization_id, location_id, category_id, name, description, allergens, available, image_url)
  values (v_org, v_location, v_category, 'African Beans Plate',
    'Slow-cooked African beans in a hearty sauce, seasoned for a filling, soulful meal. Choice of fish or chicken, served with rice.',
    '{}', true, v_images || '/beans-plate.jpg')
  on conflict (category_id, name) do update set description = excluded.description, available = true, image_url = excluded.image_url, version = menu_items.version + 1
  returning id into v_item;
  insert into item_prices (price_book_id, menu_item_id, amount_minor) values (v_book, v_item, 8000);

  ------------------------------------------------------------ beef special
  insert into catalog_categories (organization_id, location_id, name, sort_order)
  values (v_org, v_location, 'Beef Special', 2)
  on conflict (location_id, name) do update set sort_order = excluded.sort_order
  returning id into v_category;

  insert into menu_items (organization_id, location_id, category_id, name, description, allergens, available, image_url)
  values (v_org, v_location, v_category, 'Beef Dish Special',
    'Tender beef with bold La Divine Eden flavour. Choice of pondu or spinach, served with pap or rice.',
    '{}', true, v_images || '/beef-special.jpg')
  on conflict (category_id, name) do update set description = excluded.description, available = true, image_url = excluded.image_url, version = menu_items.version + 1
  returning id into v_item;
  insert into item_prices (price_book_id, menu_item_id, amount_minor) values (v_book, v_item, 10000);

  ---------------------------------------------------------------- add-ons
  -- Left out on purpose: the poster does not price them, and a menu that
  -- guesses a price charges the guest for the guess. Add them when you know
  -- the number, uncommenting and filling in the amount_minor values.
  --
  -- insert into catalog_categories (organization_id, location_id, name, sort_order)
  -- values (v_org, v_location, 'Add-ons', 3)
  -- on conflict (location_id, name) do update set sort_order = excluded.sort_order
  -- returning id into v_category;
  -- insert into menu_items (organization_id, location_id, category_id, name, description, available, image_url)
  -- values (v_org, v_location, v_category, 'Extra Fish', 'Extra portion of fish.', true, v_images || '/extra-fish.jpg')
  -- returning id into v_item;
  -- insert into item_prices (price_book_id, menu_item_id, amount_minor) values (v_book, v_item, 0000);
  -- ... Extra Chicken, Extra Pap or Rice

  raise notice 'Menu published for % (price book %).', v_slug, v_book;
end $$;

-- What the storefront will now serve.
select c.name as category, m.name as item, p.amount_minor / 100.0 as price,
       pb.currency, m.image_url is not null as has_photo
from menu_items m
join catalog_categories c on c.id = m.category_id
join item_prices p on p.menu_item_id = m.id
join price_books pb on pb.id = p.price_book_id and pb.status = 'published'
join locations l on l.id = m.location_id
where l.slug = 'divine-eden-b56906'
order by c.sort_order, m.name;
