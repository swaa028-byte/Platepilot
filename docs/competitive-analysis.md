# Competitive analysis — REA evidence ledger

Method: REA `capture-browser-scenario` (Playwright, owned temporary profile, headless Chromium
159.0.8154.6) against each vendor's public site, capturing DOM, accessibility tree, final URL and
a screenshot, then reading the retained Evidence. Each capture is a recorded Evidence record with
its own `evidence_id`; the identifiers are listed per product below.

Scope note: this is an analysis of **publicly reachable marketing and product pages only**. No
vendor account was used, no login was attempted, and no paid, private or in-product behaviour was
observed. Every statement below is a claim the vendor makes on its own public site, not verified
product behaviour. Verified-behaviour claims remain out of scope until a licensed pilot account is
available.

## Evidence coverage

| Product | Target | Result | Evidence id |
|---|---|---|---|
| Square for Restaurants | `squareup.com/us/en/restaurants` | captured | `ev_3a7171411ba7e…` |
| Square for Restaurants | `squareup.com/us/en/restaurants/capabilities` | captured | phase 2 |
| Square Staff | `squareup.com/us/en/staff` | captured | phase 2 |
| Petpooja | `petpooja.com/` | captured | `ev_d532d0b21f242…` |
| Petpooja POS | `petpooja.com/poss` | captured | phase 2 |
| Restroworks | `restroworks.com/` | captured | phase 2 |
| Restroworks Kitchen | `restroworks.com/kitchen-management-software/` | captured | phase 2 |
| Restroworks Insights | `restroworks.com/restaurant-insights-software/` | captured | phase 2 |
| Rezku | `rezku.com/` + `rezku.com/restaurant-pos/` | captured | phase 2 |
| UpMenu | `upmenu.com/features/` | captured | phase 2 |
| Flipdish | `flipdish.com/` | captured | phase 2 |
| Flipdish KDS | `flipdish.com/pos-system/kitchen-display-system` | captured | phase 2 |
| Flipdish Reporting | `flipdish.com/pos-system/reporting-and-analytics` | captured | phase 2 |
| JustBilling | `justbilling.in/` | captured | phase 2 |
| TallyPrime | `tallyprime.com`, `tally.in` | **not reachable** | — |

TallyPrime is an explicit unknown: DNS resolves (`52.66.182.155`) but the TLS/HTTP connection never
completes, for both `curl` and the REA-launched Chromium. No Evidence was collected for it, and no
feature claim is made about it below. Its position in the vendor list (a generic accounting package
framed as a restaurant alternative) is noted only as supplied context, not as an observation.

## What the evidence shows

### Kitchen display and production — the strongest shared pattern
Restroworks, Flipdish, Rezku, Square and Petpooja all ship a kitchen display and all describe the
same concrete mechanics, which makes it the safest pattern to copy:

- **Item routing to named stations**, not one undifferentiated ticket. Restroworks lists "Grill",
  "Fry", "Cold prep" as separate production areas; Flipdish calls it "Prep stations — prepare
  orders faster by sending them to different stations".
- **Ticket header carries order number, service type, table and elapsed time** (`#612  Dine-in · T9`
  with a running timer on Restroworks' KDS page).
- **Modifiers, allergens and customer instructions rendered inline on the ticket**, in a fixed
  format regardless of channel ("quantities to modifiers to chef's notes … standardised format, no
  matter where the order comes from" — Flipdish). Restroworks shows "No onion", "+ Extra cheese"
  and a "Dairy" allergen tag.
- **Independent item state**, so a ticket can be half done: "item-level bumping" and "combo bumping"
  (Restroworks), "drag and drop tickets on the KDS to change their priority" (Flipdish).
- **Hold and fire** — a ticket can be held and released later (Restroworks).
- **Production accounting**: Restroworks' production panel tracks *prepped*, *sold* and *left* per
  item ("50 burgers prepped. 42 sold. 8 left. 20 more to prepare"), plus forecast, shortage alerts
  and produced-vs-sold visibility.
- Square's phrasing is the most operational: "Route tickets to the right station with a custom
  kitchen display system. Sync menus and inventory in real time so diners never order unavailable
  items." — i.e. stock availability and kitchen routing are the same system.

### Inventory, recipes and food cost
- Petpooja: "item-wise auto deduction", "low-stock alerts", "day-end inventory reports".
- Restroworks: Recipe Management ("consistent taste, controlled food costs"), Supply Chain, Central
  Kitchen, Waste reporting, and "ingredient-level recipe & COGS" with "actual vs. theoretical
  variance".
- Flipdish: "accurate, real-time reports on COGs, inventory, wastage, discrepancies, and
  profitability … even on the level of single-ingredient items".
- Square: an "order guide" that takes vendor price sheets and gives "a side by side view of cost
  per unit in real time across vendors", and can "turn your menu into an ingredients list instantly".
- JustBilling: inventory management as a first-class pillar alongside GST-compliant billing.

Common shape: **menu item → recipe → ingredient → stock movement**, with depletion driven by an
order event and costing expressed per ingredient.

### Reporting and analytics
Restroworks' Insights page is the most specific observed design, and it is the reference for a
PlatePilot report:

- **Net sales today** with a percentage delta against the same weekday last week, plus a
  **by-hour** sales curve (11 AM / 2 PM / 6 PM / 10 PM).
- **Food cost card**: `Ideal 28.5%`, `Actual 31.2%`, `+2.7 pts`, `$1,240 leak`, and the top leaking
  item ("Mozzarella").
- **Hierarchy view** Brand → Format → Cluster → Outlet, e.g. "Burger Co. · 42 outlets · $184.2K".
- **KPI dashboard** the user composes: Net sales, Covers, Avg check, Voids, "+ Add KPI", saved as a
  template, filterable by brand/format/cluster/location, with role-based access.
- **Anti-theft**: "Discount & voids", "Flag suspicious voids and discounts", "View your
  transaction-level loss", "Monitor suspicious activity … Investigate flagged transactions".
- Flipdish adds "custom reports", "multi-outlet reporting in one central place", a manager mobile
  app, and hourly sales / best-selling items / busiest dispatch type.
- Petpooja claims "80+ essential business reports" covering day-end sales, online orders, staff
  actions and inventory consumption.
- Rezku: "Advanced reporting", "real-time data".
- Square: reporting as a capability pillar, with loyalty spend and revenue impact framed as deltas.

### Order channels and front-of-house mechanics
- **Order types** repeated across vendors: in-house, online, delivery partner, QR code, kiosk,
  takeaway/"to-go", catering ("plus support revenue streams like catering with invoicing" —
  Square; "To-go & delivery" — Rezku).
- **Tableside ordering**: servers take the order, customise, and take payment at the table
  (Square, Rezku, Petpooja, UpMenu).
- **Bill splitting and table merging**: Petpooja — "Accept payments either by splitting bill or
  merging tables"; Square — "scan to pay, item splits, and bar tabs".
- **Self-order kiosk** (Square, Rezku, UpMenu, Flipdish) as a labour-cost lever, plus
  **QR code ordering** (Square, Restroworks, UpMenu).
- **Delivery**: driver assignment from the KDS ticket (Flipdish), delivery dispatch with third
  parties, no own fleet needed (UpMenu), delivery management and courier apps.
- **Customer-facing display** (Rezku, Restroworks) as a separate surface from the kitchen display.

### Staff, shifts and multi-location
- Square: Shifts, Payroll, Team communication, advanced access/roles.
- Rezku: "integrated timecard and payroll tool".
- Petpooja: a payroll product with biometric hardware, and a task-management product for staff
  assignments.
- Restroworks and Petpooja both lead with **multi-outlet / multi-brand** structure: central control
  with regional pricing and reporting, franchise chains, cloud kitchens, food courts, stadiums,
  cinemas — a long tail of venue formats.
- Write-ups emphasise a predictable rollout: build the menu, train, go live (Rezku's four steps),
  personalised setup, hardware pairing.

### Product shape and integration
- **Back-of-house suites are sold as a suite, not a module** (Restroworks: Platform, Menu
  Management, Open APIs, Security & Compliance; marketplace of 500+ integrations; ISO 27001, SOC 2,
  GDPR).
- **Open APIs and an app/integration marketplace** are table stakes (Square Developer Platform,
  Flipdish Developers, Petpooja "Multiple integrations – single dashboard", UpMenu Integrations).
- **Segmented by business format** rather than one generic product: QSR, fast casual, cafe, bakery,
  fine dining, bars, food court, cloud kitchen, drive-thru, hotel, banquet, catering, stadium,
  cinema (Restroworks); coffee shops, QSR, drive-thru, full service, bars, food trucks, catering,
  bakeries, pizzeria (Square); pizza POS (Rezku); cloud kitchens and large chains (Petpooja).

### Payment and tax detail
- JustBilling: **100% GST compliance**, product-level tax, offline-capable (Windows POS), multi-store
  support, cloud backup.
- Square: transparent rate cards, cash, card, QR, bar tabs, buy-now-pay-later.
- PlatePilot's existing rules (integer minor units, per-location currency, no auto-FX, refunds in
  original currency) match what a strict-tax vendor implies and are **not** a gap.

## Design lessons mapped to PlatePilot

Design lessons are separated from feature gaps because they carry different risk: a wrong feature
is wasted work, a wrong interaction is a regression on every shift.

### Interaction design
1. **One order type switch at the top of the register**, because every vendor lists order types as
   a first-class choice and the ticket header shows service type + table.
2. **Station chips on the order item**, so a waiter can send an item to the fryer without leaving
   the order. The KDS then groups by station.
3. **KDS ticket layout fixed and colour-coded**, with the ticket header always carrying order
   number, service type, table and elapsed time, and the item rows always carrying quantity,
   modifiers, allergens and customer note in a fixed order.
4. **Item-level bump, not ticket-level**, so a ticket can be served partially.
5. **Report cards lead with a number and a delta** ("Net sales today $42,830, −6.2% vs last Thu"),
   then the supporting detail, rather than a grid of figures with no headline.
6. **Empty states that name the missing configuration** rather than showing zeros — PlatePilot's
   existing rule.

### Feature gaps worth closing, in dependency order
1. Recipe → ingredient → stock movement, with depletion driven by an order event and exactly-once
   semantics, then ingredient-level cost. Everything in the reporting and food-cost layer depends
   on this.
2. Kitchen station routing, per-item ticket state, and a KDS surface grouped by station.
3. Day-end reporting: net sales, covers, average check, voids and discounts, hourly sales,
   per-currency separation.
4. Anti-theft flags over voids and discounts.
5. Bill split/merge and bar tabs; tableside capture at the table.
6. Staff rota and role/permission model beyond the current membership roles.

### Deliberately not copied
- Platform breadth claims (500+ integrations, ISO/SOC 2 certification, AI forecasting) are sales
  positions, not proven capabilities, and cannot be honoured without the engineering to support
  them.
- Predictive forecasting and AI menu optimisation are recorded as vendor claims only; PlatePilot
  will not present a forecast it cannot compute honestly.
- Hardware retail and payroll products are outside PlatePilot's scope.
