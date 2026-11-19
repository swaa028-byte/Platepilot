# PlatePilot build status

Updated: 2026-11-19. Branch: `feature/platepilot-core`. Nothing has been pushed,
deployed, connected to a live merchant, or run against a real payment provider.

## Release labels

- **IMPLEMENTED**: code exists in this checkout. Not a production-readiness claim.
- **VERIFIED LOCALLY**: the recorded command passed on this checkout.
- **PROVIDER VERIFIED**: an authorised provider sandbox check passed. None has run.
- **PILOT ACCEPTED**: authorised restaurant staff accepted the operational
  checklist. No pilot has been supplied.
- **READY FOR LIVE**: all release gates and explicit approval exist. PlatePilot is
  **not** in this state.

## Commands actually run on this checkout, and their results

All commands were run locally on Node `v25.8.2` with pnpm `12.21.0`
(`npx -y pnpm@12.21.0 …`; pnpm is not installed globally on this machine).

| Command | Result |
| --- | --- |
| `pnpm lint` | pass — 0 errors, 0 warnings |
| `pnpm typecheck` | pass |
| `pnpm test` | pass — 18 of 18 (5 files) |
| `pnpm test:db` | pass — 15 of 15 (2 files) |
| `pnpm build` | pass — 42 routes, 5 locales prerendered |
| `pnpm test:e2e` | pass — 10 of 10 (Chromium desktop + WebKit mobile) |

`pnpm test:db` runs the four migrations and the operational workflows against
real PostgreSQL via PGlite. `pnpm test:e2e` runs against a **production build**
(`next build && next start`), because the dev server preloads lazy chunks and
would give a false reading of the opt-in 3D bundle.

## Defects found by auditing this checkout, and fixed

Each of these was a real failure, reproduced before the fix.

1. **Typecheck failed.** `Grid2D` is not exported by lucide-react 1.76.0. Renamed
   to `Grid2x2`.
2. **Lint failed.** `FloorPlanner` set state inside effects. Rewritten on
   `useSyncExternalStore` with a cached snapshot so the snapshot stays
   referentially stable.
3. **Build failed.** `scripts/check-messages.ts` used top-level await under a CJS
   transform and resolved `messages/` relative to the wrong directory. Converted
   to a `main()` function with a `process.cwd()`-relative path.
4. **Build failed.** next-intl could not find its request config. Added
   `createNextIntlPlugin("./src/i18n/request.ts")` to `next.config.ts`.
5. **Database test failed.** Test inserts omitted `organizations.default_locale`
   and `orders.customer_locale`. The schema is correct; the test was fixed.
6. **Manual onboarding was broken.** The "Enter restaurant details manually"
   button sat inside the search form without `type="button"`, so it submitted
   the form instead of advancing. Any merchant without a Google key could not
   reach manual setup at all.
7. **Room width was silently discarded on WebKit.** React's controlled-input
   value tracker dropped the update for `type="number"`, then restored the DOM
   to the empty state — verified by reading React's props off the node
   (`reactValue` was `""` on WebKit and `"8"` on Chromium). The dimension inputs
   are now uncontrolled and read from refs at submit time.
8. **Migrations 002–004 could not be applied at all.** Migration 002 created a
   tenant policy on `refunds.organization_id`, but the column did not exist.
   Every migration after 001 therefore failed. The column, a backfill and a
   location foreign key were added before the policies.
9. **Menu import was unauthenticated.** `/api/menus/import` accepted a CSV from
   anyone. It now requires a signed-in user and is rate limited.
10. **The 3D bundle appeared to load eagerly.** The end-to-end suite ran against
    the dev server, where Turbopack preloads lazy chunks. The suite now runs
    against a production build, and a dedicated test asserts the Three.js chunk
    is requested only after an explicit opt-in.
11. **WebKit dropped its browser context** when Chromium and WebKit ran
    concurrently. The end-to-end suite now runs one worker at a time.

## Workflow ledger

| Workflow | State | Evidence / remaining gap |
| --- | --- | --- |
| Empty installation | VERIFIED LOCALLY | Fresh migrations create zero merchant records; asserted in `tests/db` |
| Google discovery | IMPLEMENTED | Adapter, attribution, Place-ID-only persistence. No authorised key, so not PROVIDER VERIFIED |
| Manual onboarding | VERIFIED LOCALLY | Wizard, legal country / currency / timezone / locale selection; browser-tested |
| Menu import and publish | IMPLEMENTED | CSV parse, preview, publish with versioned price book; contract-tested locally |
| Server-side pricing | VERIFIED LOCALLY | Modifiers, promotions, tax-inclusive and tax-exclusive, delivery fee, service fee; DB tests |
| Opening hours and service area | VERIFIED LOCALLY | `app_is_open_at` and delivery postal-code area; DB tests |
| Storefront order | IMPLEMENTED | `app_create_order` prices everything server-side. The RPC is DB-tested; the HTTP route is **not** verified against a live Supabase instance |
| Staff (POS) order | IMPLEMENTED | `app_create_staff_order` with cash settlement and one kitchen ticket; DB tests. No staff UI |
| Kitchen ticket states | IMPLEMENTED | Allowed transitions enforced on the server; DB tests. No KDS UI and no ticket list endpoint |
| Verified online payment | IMPLEMENTED | Attempt persisted, raw-body HMAC, independent re-verification, atomic apply, one ticket, duplicate-success review. No provider credentials, so not PROVIDER VERIFIED |
| Refunds | IMPLEMENTED | `app_request_refund` enforces the refundable limit and role; DB tests. The provider refund call is not implemented |
| Cash shifts and close of day | IMPLEMENTED | Open, expected total from cash tenders, variance review; DB tests. No register UI |
| Reservations | IMPLEMENTED | Capacity and table conflicts checked in the booking transaction; DB tests. No host UI |
| Live Floor (2D) | VERIFIED LOCALLY | Accessible 2D editor: keyboard moves, touch, grid, draft/publish version check |
| Live Floor (3D) | VERIFIED LOCALLY | Lazy client-only renderer, demand frameloop, capped DPR, context-loss fallback, DOM legend. Verified in Chromium and WebKit |
| Non-3D routes | VERIFIED LOCALLY | The Three.js bundle is absent from the production HTML of the storefront and is requested only after opt-in |
| Internationalisation | VERIFIED LOCALLY | EN/FR/ES/PT/AR catalogs, 199 messages each, CI fails on a missing or extra message |
| Tenant isolation | IMPLEMENTED | RLS on every exposed table, membership checks in every mutating function. Cross-tenant access is **not** yet exercised against a live Supabase instance |
| Inventory, CRM, messaging, reports, dispatch | IMPLEMENTED | Schema, ledger tables and outbox only. No workflows, APIs or reports |
| Integrations | IMPLEMENTED | Google, Paystack, Stripe and PayPal adapters. Accounting, local POS and courier partners are BLOCKED, not connected |

## What is deliberately not built yet

- **Staff web UI.** The register, kitchen display, reservations host screen and
  close-of-day screens do not exist. The operations page is an honest static
  overview; the workflow APIs exist and are DB-tested but have no interface.
- **Inventory depletion and stock counts.** Tables and append-only ledger exist;
  the exactly-once depletion event does not.
- **Reporting queries.** No gross/net sales, mix, prep-time or settlement
  queries exist, although the underlying columns do.
- **Messaging, loyalty and CRM screens.** Consent tables and the loyalty ledger
  exist; there is no user interface and no provider adapter.
- **Delivery dispatch, catering quotes and dispute handling.**
- **Provider refund and dispute state machines.** Refunds are recorded as
  requested and reconciled by hand.
- **Multi-location reporting, currency conversion and tax tables per country.**
  Tax is a location-level basis-point setting, not a fiscal engine.

## External verification and blockers

- **Google Places: BLOCKED.** No billing-enabled project or restricted key. The
  search must report that it is not configured; it must never show example
  restaurants.
- **Paystack, Stripe, PayPal: BLOCKED.** No authorised sandbox credentials. The
  adapters and contract fixtures exist; none of them is provider verification.
- **Supabase Auth, Storage, Realtime and PostgreSQL: BLOCKED.** No local or
  hosted project is available in this workspace. The RPCs are verified against
  real PostgreSQL through PGlite, but not against PostgREST, so the HTTP routes
  are unverified end to end.
- **Real restaurant pilot: BLOCKED.** No consenting merchant, real menu, real
  operating settings or floor measurements have been supplied.
- **Thermal printers, card terminals, Xero, Sage, QuickBooks, local POS, Uber Eats
  and Mr D: BLOCKED.** No hardware, access, coverage or partner approval. Browser
  print and CSV are the honest fallbacks.
- **Live payments, real messages, public deployment, remote migrations and a git
  push: not authorised and not performed.**

## Exact next executable step

1. Start a disposable Supabase project, apply `supabase/migrations`, and run the
   HTTP routes against it: onboarding, publish a menu, place an order, verify a
   payment, complete a staff order, request a refund, close a shift, book a
   reservation. This is the first step that can raise any row above
   IMPLEMENTED for the API layer.
2. Exercise tenant isolation against that instance: two organisations, one
   location each, and confirm that every staff route and every RLS policy
   refuses cross-tenant access.
3. Build the staff surfaces for the existing APIs, starting with the register
   and the kitchen display, because the release is judged by an actual shift.
4. Request authorised provider sandbox credentials, then run the Paystack, Stripe
   and PayPal checks separately from the contract fixtures.
5. Only then approach a consenting restaurant for the pilot checklist.
