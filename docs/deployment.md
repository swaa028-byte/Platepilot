# Deployment, migration and rollback

## Environments

Use separate Supabase projects and provider accounts for development, test and live. Never share live keys with preview deployments. Configure secrets in the host secret manager; `.env.example` contains names only. `APP_URL` must be the exact HTTPS origin.

## Deploy

1. Run `pnpm install --frozen-lockfile`, lint, typecheck, unit, DB, E2E and production build on a clean checkout.
2. Apply migrations to a disposable staging project and run authenticated RLS tests.
3. Take and verify a backup before the staging migration. Review every security-definer function and RPC grant.
4. Deploy the worker before enabling new job kinds. Deploy the web service using `render.yaml`; health is `/api/health`, readiness is `/api/ready`.
5. Run provider sandbox checks separately. Do not enable ordering or live payment connections until merchant ownership, service settings and payment verification pass.

## Migration rollback

Forward-fix is preferred. Before each migration, export the schema and take a point-in-time recoverable backup. For a failed additive migration, deploy the previous application version while retaining compatible new columns. Never drop payment, order, audit or ledger data to roll back. A destructive rollback requires a separately reviewed SQL runbook and merchant approval.

## Restore drill

Restore the latest backup into a new isolated project. Verify organization counts, order/payment totals by currency, outbox uniqueness and kitchen-ticket uniqueness. Confirm RLS with two test tenants, then update a staging URL to the restored project. Record recovery time and data-loss window. Do not overwrite production during a drill.

## Alerts

Alert on readiness failure, queued-job age, repeated dead letters, payment reconciliation_required, webhook authenticity failures, duplicate successful attempts, refund ambiguity and provider error rates. Logs must contain references and status codes, not secrets, raw Google payloads, guest addresses or payment details.

## Release gate

No release is READY FOR LIVE without local checks, authorized provider sandbox checks, an authorized merchant pilot and explicit approval. Test transactions remain labeled and excluded from live reports.
