# PlatePilot against the market

This file records what PlatePilot can do compared with what a merchant is offered
elsewhere, and — more importantly — *how each line was checked*. A feature is
only marked **verified** when a test in this repository exercises it; **built**
means the code and schema exist but nothing has driven them end to end;
**schema** means the database can hold it and no product surface reaches it.

Sources: the public feature list of CloudWaitress (cloudwaitress.com), the
competitor summaries supplied with the upgrade request (TallyPrime, Petpooja,
Restroworks, JustBilling, Rezku, UpMenu, Flipdish, Square for Restaurants), and
this repository's migrations, API routes and tests.

## 1. CloudWaitress, capability by capability

| CloudWaitress capability | PlatePilot today | How it was checked |
| --- | --- | --- |
| Ordering website with its own domain and SSL | Storefront at `/[locale]/r/[slug]`; custom domains **missing** | `tests/e2e/kitchen-flow.spec.ts` orders through the real storefront API |
| Landing page and store locator | Marketing home; no location picker **missing** | `tests/e2e/platepilot.spec.ts` renders the home page |
| Admin dashboard with staff accounts and restricted access | `memberships` with roles owner/manager/host/server/kitchen and RLS on every table | `app_*` functions raise `FORBIDDEN`; the settings suite asserts a server role cannot write settings |
| Bump screen | Kitchen board, per-station routing, bump and recall | `tests/e2e/kitchen-flow.spec.ts`, `app_bump_ticket_item` |
| Online payments (Stripe, PayPal, POLi) | Stripe, PayPal and Paystack webhook routes; **no keys configured**, POLi absent | Routes exist; no end-to-end payment has been run — treated as **built**, not verified |
| Multi-currency | One currency per location, enforced by `check (currency ~ '^[A-Z]{3}$')`, used for pricing and receipts | `app_create_order`, `app_order_receipt` in `tests/db/*` |
| Customer-selectable language | Five locales (en, fr, es, pt, ar) including RTL | `tests/e2e/platepilot.spec.ts` asserts `dir="rtl"` for Arabic |
| JSON REST API | Internal JSON API across `/api/*`; no published third-party contract | — |
| Third-party integrations | Job queue and webhooks; no integration catalogue | — |
| Receipt printing over PushPrinter (Windows, Android, Linux) | **Missing.** A receipt now exists as data (`app_order_receipt`), but nothing prints it | `app_order_receipt` covered by `tests/db/operator-settings.test.ts` and the settings e2e |
| SMS notifications and marketing | **Missing** | — |
| Pickup and delivery ordering | Built and verified, including server-side repricing | `tests/e2e/settings.spec.ts` places a delivery order |
| QR dine-in ordering | Dine-in orders exist with a table; no QR code per table | `app_create_staff_order` with `table_id` in `tests/db/kitchen-operations.test.ts` |
| Delivery area, fee and minimum order | Fee, minimum order and served postal codes, validated on save and applied by the order function | `tests/db/operator-settings.test.ts`, `tests/e2e/settings.spec.ts` |
| Multiple menus by time of day | **Missing.** One published price book per location | — |
| Promotions | `promotions` table, `app_resolve_discount`, redemption counting | covered by the promotions database tests |
| Reservations | Bookings against real tables, capacity enforced, guest stored, no double-booking per table | `tests/db/operator-settings.test.ts` |
| Reporting | Day-end report: net sales, covers, average check, hourly, channel and service-type splits, discounts and cancellations | `app_day_end_report` in `tests/db/*`; `/api/staff/reports/day-end` |
| Export to accountants | **Missing** | — |

## 2. What the competitor set expects

| Expectation | Where it comes from | PlatePilot today |
| --- | --- | --- |
| Inventory, billing and financial management in one place | TallyPrime | Stock, receipts and day-end exist; no ledger, creditors or supplier invoices |
| Purchase orders and multi-outlet stock | Petpooja | Stock receipts exist; purchase orders **missing**; multiple locations per organisation are supported |
| Recipe and stock tracking | Restroworks | Recipe lines drive stock depletion per served item — **verified** in `tests/e2e/kitchen-flow.spec.ts` |
| Tax-ready invoices | JustBilling | Receipts carry the tax rate and the exact tax amount; invoice numbering per financial year and a tax summary return are **missing** |
| Loyalty, eGift cards, delivery driver management | Rezku | KDS is native; loyalty, gift cards and dispatch are **missing** |
| Branded ordering app, customer database, marketing | UpMenu, Flipdish | Storefront and a customer book derived from real orders; branded app and campaigns are **missing** |
| Kitchen display and offline tolerance | Square for Restaurants | KDS is native; offline operation is **missing** (the embedded database mode is single-process) |

## 3. Closed in this pass, with the proof

Everything below is exercised by a test that was run, not merely written.

| Gap | Fix | Proof |
| --- | --- | --- |
| A merchant could not switch online ordering on or set hours, fee, minimum, tax or postal codes — ordering was permanently refused | `app_location_settings`, `app_update_location_settings` with database-side validation, `/api/staff/settings`, the settings page | `tests/db/operator-settings.test.ts` (paused refuses with `ORDERING_NOT_ENABLED`, open prices the order), `tests/e2e/settings.spec.ts` |
| Every reservation was refused because `restaurant_tables` was never populated | table create/rename/delete, sync from the drawn floor plan, `app_floor_plan` so the planner reopens the saved room | same two files; room sync and delete-guard cases |
| A booking lost the guest's name | `reservations.guest_name`, written by `app_create_reservation` | `app_customer_book` returns a guest who only booked |
| `GET /api/floor` returned 405 | read path added | build route table lists the route; the planner is exercised in `tests/e2e/platepilot.spec.ts` |
| A signed-in merchant could be shown "you do not have a location" | the local session is resolved inside the request and bound to the client | 36 out-of-scope reads in one end-to-end run dropped to zero |
| No receipt a merchant or a tax office could read | `app_order_receipt` with lines, discount, tax rate, tax amount, tenders | `tests/e2e/settings.spec.ts` asserts the receipt of the order it just placed |
| No way to see who the venue serves | `app_customer_book` derived from orders and bookings | `tests/db/operator-settings.test.ts` |

## 4. Still missing, in the order it blocks revenue

1. **Payments end to end.** The webhook routes exist and no provider is configured. Until a real payment is taken, "paid" is a database flag an operator sets, not money that arrived.
2. **Purchase orders and stock counting.** Stock leaves correctly when a dish is served; nothing records what was ordered from a supplier or counted at close.
3. **Multi-menu by service period** (breakfast, lunch, dinner) and **scheduled price books**.
4. **Loyalty and gift cards**, which is the most common reason a merchant leaves a storefront-only platform.
5. **Delivery dispatch**: driver assignment, ETA, and proof of delivery.
6. **Printing and QR**: a receipt printed on a counter printer, and a QR code per table that opens the storefront with that table attached.
7. **Invoice series and tax returns** for the accounting side of JustBilling/Tally.
8. **Offline tolerance** for the kitchen display.

## 5. How to reproduce the checks

```bash
pnpm test          # unit
pnpm test:db       # database, including the operator settings suite
pnpm test:e2e      # builds, cleans .data/e2e, runs the browser suite
```

The end-to-end suite runs against the embedded database, so it needs the build
made without a hosted project configured:

```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= \
SUPABASE_SERVICE_ROLE_KEY= npx next build
```

## 6. Known issue

`tests/e2e/settings.spec.ts` passes on its own and passes after the kitchen
suite, but in one full-suite run its final page assertion read an empty location
list for a merchant that had just created one; the same read through
`/api/staff/locations` returned the location seconds earlier, and the same page
rendered correctly against a fresh server. The cause was not identified with
evidence, so it is recorded here rather than papered over. The product fix that
came out of investigating it (binding the session actor to the database client)
is real and is kept.
