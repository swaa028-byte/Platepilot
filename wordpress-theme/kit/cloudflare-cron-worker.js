/**
 * PlatePilot drain tick — a separate, tiny Cloudflare Worker.
 *
 * The ordering app runs on Workers, where nothing can keep a timer alive
 * between requests. This worker exists only to call the app's existing drain
 * endpoint on a schedule, so webhook retries and the outbox keep moving.
 *
 * Deploy it separately (free plan):
 *   1. Cloudflare dashboard → Workers & Pages → Create → Worker
 *      Name it `platepilot-drain`, paste this file over the starter code.
 *   2. Settings → Variables and Secrets, add two secrets:
 *        APP_URL      = https://platepilot.<your-subdomain>.workers.dev
 *        CRON_SECRET  = the same value the app has
 *   3. Settings → Trigger Events → Cron Triggers → Add:
 *        */5 * * * *   (every five minutes)
 *
 * Without it the app still works: retries simply wait for the next drain the
 * app performs on its own.
 */

export default {
  async scheduled(event, env, ctx) {
    const run = async () => {
      const response = await fetch(`${env.APP_URL}/api/cron/drain`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.CRON_SECRET}`,
          "content-type": "application/json",
        },
      });
      if (!response.ok) {
        // Surfaced in Workers Logs; the next tick retries.
        console.error("drain failed", response.status, await response.text());
      }
    };
    ctx.waitUntil(run());
  },
};
