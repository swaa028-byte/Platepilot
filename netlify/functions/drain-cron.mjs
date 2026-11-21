// Netlify scheduled function: kicks one drain pass every ten minutes.
//
// The heavy lifting lives in the application at /api/cron/drain, where it can
// use the same database client and business logic as everything else. This
// function only authenticates to it with the shared CRON_SECRET, so no database
// credentials are duplicated into a second runtime.

export default async () => {
  const base = process.env.URL || process.env.APP_URL || "";
  const secret = process.env.CRON_SECRET || "";
  if (!base || !secret) {
    return new Response(JSON.stringify({ error: "CRON_NOT_CONFIGURED" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/cron/drain`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "DRAIN_CALL_FAILED", detail: String(error).slice(0, 200) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

export const config = { schedule: "*/10 * * * *" };
