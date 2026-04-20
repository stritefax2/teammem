import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";
import { runSchedulerTick } from "../services/connectors/sync.js";
import crypto from "node:crypto";

// Admin routes are intentionally NOT protected by the normal auth middleware.
// They're protected by a shared CRON_SECRET header that only the operator
// and their scheduler know. This is the v1 pattern used for Vercel Cron and
// similar external schedulers.
//
// Set CRON_SECRET to a long random string in production. Anything that can
// make an HTTPS request to your API and presents the header can trigger a
// scheduler tick — there's no tenant scoping here because this endpoint is
// system-wide, not user-facing.

export const adminRoutes = new Hono<AppEnv>();

function checkSecret(c: Context): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header =
    c.req.header("x-cron-secret") ||
    c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!header) return false;

  // Constant-time compare to avoid timing attacks on the secret.
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function handleSyncDue(c: Context) {
  if (!checkSecret(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    const summary = await runSchedulerTick();
    return c.json(summary);
  } catch (e) {
    console.error("Scheduler tick failed:", e);
    return c.json(
      { error: e instanceof Error ? e.message : "Scheduler tick failed" },
      500
    );
  }
}

// Vercel Cron issues GET; external cron services typically use POST. Accept
// both so the same endpoint works across deployment models.
adminRoutes.get("/sync-due", handleSyncDue);
adminRoutes.post("/sync-due", handleSyncDue);

adminRoutes.get("/health", (c) => {
  if (!checkSecret(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return c.json({
    status: "ok",
    scheduler: process.env.CONNECTOR_ENCRYPTION_KEY
      ? "configured"
      : "missing_encryption_key",
    openai: process.env.OPENAI_API_KEY ? "configured" : "missing",
  });
});
