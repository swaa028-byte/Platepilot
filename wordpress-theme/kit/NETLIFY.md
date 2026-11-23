# Deploying the ordering app to Netlify

The WordPress site is the public website. This app is the ordering system,
the staff dashboards and the storefronts. They run on two hosts and talk to one
database.

```
https://platepilot.ct.ws         WordPress   marketing site, pages, menus
https://app.platepilot.ct.ws     Netlify     ordering, staff, /r/<slug> storefronts
                                 workers.dev optional staging alias
```

## 1. The site

Netlify → **Add new site → Import an existing project → GitHub → Platepilot**.

| Setting | Value |
|---|---|
| Branch | `main` |
| Build command | `pnpm run build` (from `netlify.toml`) |
| Publish directory | `.next` |
| Node | `22` (from `netlify.toml`) |

`netlify.toml` already declares `@netlify/plugin-nextjs`, so the Next runtime,
route handlers and middleware work without further configuration.

## 2. Environment variables

Site configuration → **Environment variables**. Set these for **Production**.
The two `NEXT_PUBLIC_*` values are inlined into the browser bundle at build
time, so they must be present *before* the first successful build.

| Name | Value | Notes |
|---|---|---|
| `APP_URL` | `https://app.platepilot.ct.ws` | this app's origin, no trailing slash |
| `PUBLIC_SITE_URL` | `https://platepilot.ct.ws` | marketing routes here redirect to it |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` | build + runtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon public key | build + runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role key | secret, server only |
| `PAYSTACK_TEST_SECRET_KEY` | `sk_test_…` | secret; use `PAYSTACK_LIVE_SECRET_KEY` to go live |
| `CRON_SECRET` | a random string | secret; the cron worker sends it |

Until the custom domain is verified, use the `*.netlify.app` address as
`APP_URL`, then change it after the domain works. Changing `APP_URL` needs a
redeploy.

## 3. The custom domain

Netlify → **Domain management → Add a domain** → `app.platepilot.ct.ws`.
Netlify shows a CNAME target such as `platepilot-725.netlify.app`.

In InfinityFree (the DNS host for `ct.ws`): **DNS Records → Add DNS Record**

| Field | Value |
|---|---|
| Type | `CNAME` |
| Name | `app` |
| Target | the address Netlify gave you |

Do **not** use InfinityFree's *Subdomains* or *Addon Domains* features — those
create a folder on the PHP host, which is the opposite of what is wanted and
conflicts with the CNAME.

Then press **Verify** in Netlify so it issues the certificate. Propagation is
usually minutes.

## 4. Checks, in order

```bash
curl https://app.platepilot.ct.ws/api/ready
# {"status":"ready","database":"supabase"}

curl -I https://app.platepilot.ct.ws/en/pricing
# 301 -> https://platepilot.ct.ws/pricing   (PUBLIC_SITE_URL is working)

curl -I https://app.platepilot.ct.ws/en/login
# 200                                        (app routes stay here)
```

If `/en/pricing` returns **404**, `PUBLIC_SITE_URL` is not set: the marketing
routes are being rendered here instead of redirected, and on this host the
prerendered marketing pages are not served.

## 5. After the domain works

1. Cloudflare Worker environment: `PUBLIC_SITE_URL=https://platepilot.ct.ws`
   so the Worker also stops rendering marketing pages.
2. WordPress → **PlatePilot → Credentials → Ordering app address**:
   `https://app.platepilot.ct.ws`. This is what turns "Open your shop" into a
   real onboarding link and makes "Order online" go to the app.
3. Paystack dashboard → Settings → API Keys & Webhooks → webhook URL:
   `https://app.platepilot.ct.ws/api/webhooks/paystack`.
4. Point the cron drain at the app: deploy `cloudflare-cron-worker.js` with
   `APP_URL=https://app.platepilot.ct.ws` and the same `CRON_SECRET`.

## Why the marketing pages live on WordPress

Two copies of the same pages is what made the two sites disagree. Only one site
indexes: the WordPress one. Everything here that is not the app (pricing,
features, about, …) answers with a 301 to its WordPress page, so a visitor can
never read two different versions of the same sentence.
