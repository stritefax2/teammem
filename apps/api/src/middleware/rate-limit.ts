import { createMiddleware } from "hono/factory";

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000;
const CLEANUP_INTERVAL = 300_000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > WINDOW_MS * 2) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

export function rateLimit(maxPerMinute: number) {
  return createMiddleware(async (c, next) => {
    const auth = c.get("auth") as any;
    const key = auth?.agentKeyId || auth?.userId || c.req.header("x-forwarded-for") || "anon";

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now - entry.windowStart > WINDOW_MS) {
      store.set(key, { count: 1, windowStart: now });
      await next();
      return;
    }

    if (entry.count >= maxPerMinute) {
      const retryAfter = Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    entry.count++;
    await next();
  });
}
