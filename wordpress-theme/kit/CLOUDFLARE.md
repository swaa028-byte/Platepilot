# Deploying the ordering app on Cloudflare Workers

Your stack: **WordPress** (the website) + **GitHub** (the code) + **Cloudflare**
(the ordering app) + **Supabase** (the database). No Vercel, no Render, no
server of your own.

```
guest ──► WordPress site (InfinityFree)     menu, prices, pages
             │  [platepilot_menu] reads the database directly
             │
             └► Cloudflare Worker (ordering app)  checkout, kitchen, reports
                   │
                   └► Supabase (Postgres)  all the data
```

The website works before the Worker exists; the Worker is what makes
**checkout** real, because only a server can re-price a cart and verify a
payment. Both read the same database.

---

## 1. Before you deploy

- The repository is on GitHub, branch `main` (everything is merged there).
- Your Supabase project exists with the schema applied (`supabase/migrations/`,
  date order) and `kit/supabase-public-menu.sql` run once.
- You have from **Supabase → Project Settings → API**: the Project URL, the
  `anon` key and the `service_role` key.

## 2. Create the Worker from GitHub

1. Open the Cloudflare dashboard → **Workers & Pages** → **Create** →
   **Workers** → **Import a repository** (connect GitHub the first time).
2. Choose the `platepilot` repository, branch `main`.
3. Build settings:

   | Field | Value |
   | --- | --- |
   | Build command | `pnpm exec opennextjs-cloudflare build` |
   | Deploy command | `pnpm exec wrangler deploy` |
   | Root directory | `/` |
   | Environment variable | `NODE_VERSION` = `22` |

   `wrangler.jsonc` in the repository already sets the name (`platepilot`), the
   entry point (`.open-next/worker.js`), `nodejs_compat` and the assets
   binding, so nothing else needs configuring.

4. Add the variables below **before** the first deploy
   (**Settings → Variables and Secrets → Production**):

   | Name | Value | Type |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Text |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon public key | Secret |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service_role key | **Secret** |
   | `APP_URL` | `https://platepilot.<your-subdomain>.workers.dev` | Text |
   | `CRON_SECRET` | any long random string | **Secret** |
   | `CLOUDFLARE_WORKERS` | `true` | Text |

   Payment keys (`STRIPE_*`, `PAYSTACK_*`, `PAYPAL_*`) go in as secrets too if
   you take payments.

5. **Deploy**, then open `https://platepilot.<your-subdomain>.workers.dev/api/ready`.
   A healthy Worker answers `{"status":"ready","database":"hosted"}`.
   `"database":"local"` means the Supabase variables are missing — the app
   refuses to use embedded storage on Workers on purpose, because a Worker has
   no disk to keep it on.

## 3. Point the pieces at each other

- **Stripe / Paystack / PayPal webhooks** → `https://platepilot.<your-subdomain>.workers.dev/api/webhooks/stripe`
  (likewise `/paystack`, `/paypal`), using the same signing secrets you put in
  the Worker variables.
- **WordPress → PlatePilot (dashboard menu)** → paste the Worker URL into
  *Ordering app address*. Sign in, order buttons and the "Order online" link
  now point at the live app. Leave it empty and the site simply publishes the
  menu without offering checkout.
- **A custom domain** (optional): Worker → **Settings → Domains & Routes → Add
  custom domain**, e.g. `app.yourdomain.com`. Then update `APP_URL` to match.

## 4. Optional: keep webhook retries moving

A Worker cannot keep a timer alive, so the app's outbox/retry queue is drained
by a scheduled call. Deploy the tiny helper in
`kit/cloudflare-cron-worker.js`:

1. Workers & Pages → Create → Worker, name it `platepilot-drain`.
2. Paste the file over the starter code.
3. Variables: `APP_URL` (the Worker URL above) and `CRON_SECRET` (the same
   value).
4. **Settings → Trigger Events → Cron Triggers → Add**: `*/5 * * * *`.

Without it nothing breaks; retries just wait longer.

## 5. What the free plan covers

| Limit | Free plan | What it means here |
| --- | --- | --- |
| Requests | 100,000 per day | A busy single restaurant sits far below this |
| CPU time | 10 ms per request | Plenty: the work is HMAC signing plus a database round-trip |
| Cron triggers | Included | Used by the drain helper |
| Builds | Included | Cloudflare builds on Linux from your GitHub push |

Beyond that it is $5/month for the paid tier.

## 6. Known limits, stated plainly

- **No local image optimisation.** `next.config.ts` sets
  `images.unoptimized` when `CLOUDFLARE_WORKERS` is set, because Cloudflare's
  image resizing is a paid product. Menu photos are served as uploaded.
- **Embedded database mode is impossible here** — and now detected: on
  Cloudflare the app returns `DATABASE_NOT_CONFIGURED` instead of accepting
  orders into a filesystem that disappears.
- **Node-runtime middleware** (`src/proxy.ts`, Next 16) is supported by the
  adapter but marked experimental by Cloudflare. It handles locale routing and
  the `cf-ipcountry` geo header — which is native on Cloudflare, so language
  selection is more reliable here than on any other host.
- **Building locally on Windows** fails with `EPERM: operation not permitted,
  symlink` unless Developer Mode is on; the adapter copies traced files with
  symlinks. Cloudflare's Linux build is unaffected — deploy from GitHub, not
  from your machine.
