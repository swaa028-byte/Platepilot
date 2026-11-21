# Launching PlatePilot on Netlify

Netlify builds this repository and runs it on the Next.js runtime. There is no
build step to run by hand: the repository is the deployment.

`netlify.toml` already declares the build (`pnpm run build`, publish `.next`),
Node 22 and the Next.js runtime plugin, so the import screen needs no edits
beyond confirming the branch.

## 1. Connect the repository

Netlify → **Add new site** → **Import an existing project** → **GitHub** →
`MarcusK-ai/rea-cloudwaitress`.

| Setting | Value |
| --- | --- |
| Branch to deploy | `feature/platepilot-core` |
| Build command | `pnpm run build` (from `netlify.toml`) |
| Publish directory | `.next` (from `netlify.toml`) |

Every push to that branch then rebuilds the site.

## 2. Environment variables

Set these in **Site configuration → Environment variables**. They are the same
values that are in `.env.local` locally, which is gitignored and therefore never
shipped.

| Name | Scope | Why |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | all | the hosted project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all | the browser's key |
| `SUPABASE_SERVICE_ROLE_KEY` | all, secret | server routes only |
| `APP_URL` | all | absolute links in sitemap, robots, llms.txt and payment redirects; set it to the site URL, e.g. `https://platepilot.netlify.app` |

`GOOGLE_PLACES_API_KEY` is optional; without it address lookup falls back to
manual entry.

Do **not** add `SUPABASE_ACCESS_TOKEN` (it only exists to apply migrations from
this machine) or `PLATEPILOT_LOCAL_DB`.

### The Supabase side of those links

Supabase rewrites every authentication redirect to the project's **Site URL**
whenever the requested redirect is not on its allow list, and the default Site
URL is `http://localhost:3000`. A signup confirmation then arrives pointing at a
machine nobody is running, which looks like a broken email rather than a
configuration default.

Set both, in **Authentication → URL Configuration**:

- **Site URL**: `https://<site>.netlify.app`
- **Redirect URLs**: `https://<site>.netlify.app/**` and, to keep local
development working, `http://localhost:3000/**`

`LoginForm` already asks for `${origin}/${locale}/operations`, so once the
deployed origin is on that list the wildcard entry is what lets it through.

## 3. What happens without those variables

Nothing silently half-works. On a serverless host the app refuses the embedded
database and answers `/api/ready` with `503`

```json
{ "status": "not_ready", "dependency": "database",
  "configuration": "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required on a serverless host" }
```

so the first check after a deploy tells you whether step 2 landed.

## 4. Verify the deployment

```bash
curl -s https://<site>/api/ready            # {"status":"ready","database":"supabase"}
curl -sI https://<site>/en | head -1        # 200
curl -s https://<site>/robots.txt | grep Sitemap
```

Then in a browser: open `/en`, sign up, and confirm the settings page loads a
location. A storefront at `/en/r/<slug>` should price an order with the tax and
delivery fee the settings page saved.

## 5. Known gaps in a hosted deployment

- **The outbox now drains on a schedule.** A Netlify scheduled function
  (`netlify/functions/drain-cron.mjs`, every 10 minutes) calls
  `POST /api/cron/drain` with the `CRON_SECRET` environment variable. Each pass
  relays due `outbox_events` to the organization's registered webhooks (HMAC-
  signed bodies, `X-PlatePilot-Signature`) and works the retry queue: failed
  deliveries become `webhook.deliver` jobs retried with backoff through the
  jobs lease, dead-lettering after 8 attempts. Register a webhook with
  `app_register_outbox_webhook(actor, organizationId, url)`; the signing secret
  is returned once. Self-hosted deployments can instead run `worker/index.ts`,
  which runs the same drain loop.
- **Rate limiting is per instance.** `checkRateLimit` keeps counters in memory,
  so limits are per lambda rather than per site.
- **Payments are unconfigured.** No provider keys are set, so orders are unpaid
  by design; `/api/payments/*` returns a configuration error.

## 6. Prepared script

`scripts/launch-netlify.sh` creates the site in a team, copies the three
database values from `.env.local` into the site's environment, points
`APP_URL` at the new URL and links the folder. It stops before linking the
repository, because that step only completes through GitHub's authorisation flow.

```bash
NETLIFY_ACCOUNT=marcusk-ai ./scripts/launch-netlify.sh
```

## 7. Deploying from a machine instead of GitHub

Only useful for a preview of an unmerged commit:

```bash
npx netlify-cli deploy --build --prod
```

This needs the CLI to be logged in to the account that owns the site. It uploads
a local build, so the site's environment variables must still be set.
