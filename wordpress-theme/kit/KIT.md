# PlatePilot kit — WordPress + GitHub + Supabase

This kit is built for exactly three accounts: **WordPress** (your host),
**GitHub** (the code) and **Supabase** (the database). No Vercel, no Render,
no Node host, no build step.

## What runs where

| Piece | Runs on | What it does |
| --- | --- | --- |
| The website (this theme) | WordPress / InfinityFree | Every page: home, pricing, features, integrations, white label, about, your live menu |
| The database | Supabase | Your restaurant, menu, prices, orders, reports |
| The theme's data access | PHP inside WordPress | Reads your published menu over HTTPS with the anon public key you paste in the dashboard |

That means **the site is fully functional on PHP hosting alone**: it
publishes your real menu, prices and allergens, and updates when you change
them in the database. No application server is involved.

## Setup, in order

### 1. Database

1. Create a Supabase project (the free tier is enough).
2. Apply the PlatePilot schema. In the dashboard: **SQL Editor → New query**,
   then run the migration files from `supabase/migrations/` in date order
   (`202611190001_core.sql` first). Or, from a machine with the repo:
   `supabase db push`.
3. Run `kit/supabase-public-menu.sql` (this folder). It creates the read-only
   `public_menu(slug, locale)` function and grants it to `anon` — anonymous
   visitors can read a published menu and nothing else.
4. Copy two values from **Project Settings → API**: the **Project URL** and
   the **anon public** key.

### 2. WordPress

1. Upload `platepilot-theme.zip` in **Appearance → Themes → Add New**.
2. Create the pages and give each one its template:
   `Pricing`, `Features`, `How it works`, `Integrations`, `White label`,
   `About`, plus a private `Connection status` page.
3. **Settings → Reading → Your homepage displays: A static page** → pick a
   page (the theme's `front-page.php` renders it).
4. Open **PlatePilot** in the dashboard and paste:
   - Supabase project URL
   - Supabase anon public key
   - your restaurant slug (e.g. `la-divine-eden`)
   - the ordering app address **only if** you later host the app
5. Save. The screen turns green and reports how many published items it
   found — that is a real read of your database, not a stub.

### 3. Your menu on any page

```
[platepilot_menu slug="la-divine-eden"]
```

Renders the published menu with categories, descriptions, allergens and
prices read live from Supabase. `[platepilot_status]` (admin-only) shows
what is configured and what the last live read returned.

## What PHP hosting can and cannot do — read this before selling

**Works without any app server**

- The whole marketing site, in five languages.
- Live menu display, table QR pages, allergens and prices from the database.
- Your own domain, SSL, SEO metadata.

**Needs the ordering engine (the Node app in this repo)**

- Checkout, card capture and **server-side payment verification**.
- The kitchen display with station routing.
- Split bills, bar tabs, day-end and anti-theft reports.
- Table reservations with holds.

WordPress on a PHP host cannot execute that engine. If you take orders on
the site, they must be accepted by a server that re-prices the cart and
verifies the payment — otherwise a visitor can edit prices in their browser.
Two honest paths:

1. **Link out instead of checking out.** Leave the app address empty: the
   site shows your menu and a phone/WhatsApp order line. Nothing pretends
   to take payments.
2. **Host the app when you can.** Any Node host (even a spare machine with a
   tunnel) makes checkout real. Paste its address in the settings and the
   order buttons switch on.

Do not write orders straight into the database from the theme to "close the
gap". Prices would be client-controlled and payments unverified; that is the
one thing this architecture is designed to prevent.

## Keys, and why the anon key is safe here

The anon public key can only do what row-level security allows. After step
1.3 that is: read one published menu by slug. It is stored in the WordPress
options table server-side, sent only in server-to-server requests, and never
printed in a page or a shortcode.

Never paste the **service_role** key into WordPress. That key bypasses row
level security, and a PHP host is not the place for it.
