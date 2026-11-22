=== PlatePilot theme ===
Contributors: platepilot
Requires at least: 6.0
Tested up to: 6.7
License: GPLv2 or later

A green, self-contained marketing theme for the PlatePilot restaurant
platform: statement hero with a typed rotating word and a three.js room,
GSAP scroll reveals, the four service modes, a numbered walk-through,
tabbed feature lists, the integration catalog, FAQs, and the green
closing banner. No build step; GSAP, ScrollTrigger and three.js load
from a CDN.

== Setup (five minutes) ==

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
3. Settings → Reading → set the homepage to a static page. The front page
   uses the theme's `front-page.php` automatically.
4. Open **PlatePilot** in the dashboard menu and enter the credentials:
   - the PlatePilot app address (where the ordering engine runs),
   - the hosted-database project URL and its public key,
   - your payment gateway keys (Stripe / Paystack / PayPal).
   The **Connection status** page turns green when everything is present.
5. Publish a menu from the PlatePilot app, then show it anywhere with the
   shortcode `[platepilot_menu slug="your-restaurant"]`.

== What this theme can and cannot do ==

It carries the site, stores the credentials, reads published menus live
from your hosted database, and links visitors into the app. The ordering
engine itself (checkout verification, kitchen display, reports) is the
PlatePilot Node application and needs Node hosting — free PHP hosting
cannot run it. Point "PlatePilot app address" at wherever the app runs.

== Notes ==

- No vendor names appear anywhere on the public site; the settings
  labels are vendor-neutral.
- All strings are translatable (`platepilot` text domain).
- The theme contains no mock or demo data: pages render your copy or
  nothing.
- Motion respects the visitor's reduced-motion preference; on devices
  without WebGL the hero falls back to the gradient.
