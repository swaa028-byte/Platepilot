# PlatePilot

**Your restaurant, from first order to close.**

PlatePilot is an original, modular restaurant operating system built with Next.js App Router, TypeScript, PostgreSQL/Supabase, Tailwind CSS, Vitest and Playwright. The repository name remains `rea-cloudwaitress`; the product brand is PlatePilot.

> Working brand only: no trademark or domain clearance is implied. No live payments, public deployment, real messages, demo merchant records, or provider verification are included.

## Staff surfaces

| Surface | What it is |
| --- | --- |
| `/[locale]/kitchen` | The kitchen display. One column per station; ticket number, service type, table, guest and elapsed time on every ticket; the allergy a guest raised; each line is held, started, readied and served on its own |
| `/[locale]/reports` | The day-end report, read from the orders the location actually took |
| `/[locale]/floor-planner` | The dining-room plan, with an opt-in 3D view that loads only when it is asked for |

## Run locally

Prerequisites: Node.js 22.12+ and pnpm 12.21.0 (via Corepack or the pinned `npx` command).

```bash
corepack enable
corepack prepare pnpm@12.21.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. A new installation is intentionally empty. Without Supabase or Google credentials, the public site, manual-setup UI, local floor planner, health endpoint and configuration states remain available; authenticated persistence and Google search report that they are not configured rather than returning fabricated results.

For a disposable local Supabase stack, install the Supabase CLI separately, run `supabase start`, apply `supabase/migrations`, and copy the local URL/keys into `.env.local`. Never place the service-role key in a `NEXT_PUBLIC_` variable.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
npx playwright install chromium webkit
pnpm test:e2e
pnpm build
```

The end-to-end suite builds and starts a production server itself; you do not
need a running dev server. The database suite runs the migrations against real
PostgreSQL through PGlite, so no external database is required.

See [BUILD_STATUS.md](BUILD_STATUS.md) for the commands that were actually run,
their results, and the remaining blockers. Provider sandbox checks are separate
from local contract tests.

## Structure

- `src/app/[locale]`: localized storefront, onboarding, authentication and operations UI
- `src/app/api`: authenticated onboarding, orders, staff workflows, provider callbacks and health/readiness
- `src/domain`: exact money, pricing, orders, reservations and inventory logic
- `src/server`: Supabase auth/db, security and provider adapters
- `src/components/floor`: accessible 2D planner and optional client-only 3D renderer
- `supabase/migrations`: schema, RLS and transactional workflows (core, security, onboarding, operations)
- `worker`: leased PostgreSQL jobs/outbox processing with retries and dead letters
- `tests`: unit, database, contract and browser checks
- `docs`: deployment, operations, security, integrations and staff guides

## Staff workflow API

These routes require a signed-in staff member and are authorised again on the
server inside each database function.

| Route | Purpose |
| --- | --- |
| `POST /api/staff/orders` | Open a walk-in, phone, takeaway or dine-in order. Prices are resolved from the published price book; a cash or counter tender settles immediately and creates exactly one kitchen ticket |
| `POST /api/staff/tickets` | Move a kitchen ticket to its next state. The server owns the transition rules |
| `POST /api/staff/refunds` | Request a refund against a settled payment, within the refundable limit |
| `POST` / `PUT /api/staff/shifts` | Open a cash shift and close the day with an expected total and a variance |
| `POST /api/staff/reservations` | Book a table, with room capacity and table conflicts checked in the booking transaction |
| `GET /api/staff/locations` | The locations the signed-in member belongs to, with the role they hold at each |
| `GET /api/staff/kitchen` | The kitchen board: live tickets grouped by the station that prepares them |
| `POST /api/staff/kitchen` | Move one ticket line to its next state. Serving a line takes the recipe ingredients out of stock, exactly once |
| `GET /api/staff/inventory` | The stock position, with low-stock flags |
| `POST /api/staff/inventory` | Record stock coming in. The delivery note id is idempotent and scoped to the location |
| `GET` / `POST /api/staff/inventory/config` | Read and change the ingredients, the recipes and the production stations |
| `GET /api/staff/reports/day-end` | The trading day: net sales, covers, average check, discounts, cancellations, hourly sales, and the split by channel and service type |

Public order placement (`POST /api/orders`) is priced on the server too: item
prices, modifier deltas, promotions, tax, service fee, delivery fee, opening
hours and the delivery service area are all resolved, never taken from the
client.

## Documentation

- [Deployment and rollback](docs/deployment.md)
- [Operations and restore](docs/operations.md)
- [Location settings](docs/location-settings.md)
- [Competitive analysis and the evidence behind it](docs/competitive-analysis.md)
- [Security and privacy](docs/security.md)
- [Integration verification matrix](docs/integrations.md)
- [Staff training and pilot acceptance](docs/staff-training.md)

PlatePilot never treats a Google Place ID as proof of ownership, a hosted browser redirect as proof of payment, or a code fixture as provider verification.
