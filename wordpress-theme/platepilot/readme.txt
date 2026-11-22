=== PlatePilot theme ===
Contributors: platepilot
Requires at least: 6.0
Tested up to: 6.7
License: GPLv2 or later

A green, self-contained marketing theme for PlatePilot: statement hero with
a typed rotating word and a three.js room, GSAP scroll reveals, four flat
pricing plans, the service modes, a numbered walk-through, tabbed feature
lists, the integration catalog, FAQs, and the closing banner. No build
step; GSAP, ScrollTrigger and three.js load from a CDN.

It also reads your published menu straight from your Supabase project, so
the site works on plain PHP hosting — no application server required. See
../kit/KIT.md for the recommended WordPress + GitHub + Supabase setup.

== Setup (ten minutes) ==

1. Upload the `platepilot` folder (or the zip) under Appearance → Themes
   and activate it.
2. Create the pages and assign templates under Pages → Add New:
   - "Pricing"        → template **Pricing**
   - "Features"       → template **Features**
   - "How it works"   → template **How it works**
   - "Integrations"   → template **Integrations**
   - "White label"    → template **White label**
   - "About"          → template **About**
   - "Status"         → template **Connection status** (keep private)
   Add "la-divine-eden" style slugs so the navigation finds them.
3. Settings → Reading → set the homepage to a static page. The front page
   uses the theme's `front-page.php` automatically.
4. In the Supabase SQL editor, run `kit/supabase-public-menu.sql` so the
   public key can read a published menu and nothing else.
5. Open **PlatePilot** in the dashboard menu and enter:
   - Supabase project URL,
   - Supabase anon public key,
   - your restaurant slug,
   - the ordering app address only if you host the app.
   The screen reports how many published items it found.
6. Show the menu anywhere with `[platepilot_menu slug="your-restaurant"]`.

== What this theme can and cannot do ==

It carries the site, reads published menus live from Supabase, and links
into the ordering app when you have one. Checkout, the kitchen display and
the reports are the PlatePilot Node application and need a Node host;
free PHP hosting cannot run them. Without the app the site still publishes
your real menu — the ordering buttons stay off rather than pretending.

== Notes ==

- All strings are translatable (`platepilot` text domain).
- No mock or demo data: pages render your copy, and menus come from your
  database or not at all.
- Prices live in one array in `inc/content.php` (`$c['pricing']['plans']`).
- Motion respects the visitor's reduced-motion preference; without WebGL
  the hero falls back to the gradient.
- Keys are stored server-side and never printed publicly. Never store the
  database's service_role key here.
