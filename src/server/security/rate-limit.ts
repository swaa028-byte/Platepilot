const buckets = new Map<string, { resetAt: number; count: number }>();

/** Best-effort per-process guard. Deployments must also enforce the DB/edge rate limit. */
export function checkRateLimit(key: string, limit = 12, windowMs = 60_000) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { resetAt: now + windowMs, count: 1 });
    return;
  }
  if (current.count >= limit) throw new Error("RATE_LIMITED");
  current.count += 1;
  if (buckets.size > 10_000) {
    for (const [id, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(id);
  }
}
