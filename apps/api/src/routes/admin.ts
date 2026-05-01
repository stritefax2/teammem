import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";
import { runSchedulerTick } from "../services/connectors/sync.js";
import { authMiddleware } from "../middleware/auth.js";
import { query } from "../db/client.js";
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

// Operator-only activity feed. Distinct from /sync-due above — this one is
// hit from the web UI by a logged-in user, so it uses the normal auth
// middleware plus an ADMIN_EMAILS allowlist (comma-separated). When the
// list is empty in production, the endpoint refuses everyone.
function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

adminRoutes.get("/activity", authMiddleware, async (c) => {
  const auth = c.get("auth");
  if (!auth.userId) {
    return c.json({ error: "User session required" }, 401);
  }

  const me = await query<{ email: string }>(
    "SELECT email FROM users WHERE id = $1",
    [auth.userId]
  );
  if (!isAdminEmail(me.rows[0]?.email)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const limit = Math.min(Number(c.req.query("limit") || 200), 500);
  const kind = c.req.query("kind");

  const params: unknown[] = [];
  let where = "";
  if (kind) {
    params.push(kind);
    where = `WHERE kind = $${params.length}`;
  }
  params.push(limit);

  const result = await query(
    `SELECT id, kind, workspace_id, workspace_name, user_email,
            metadata, created_at
     FROM activity_events
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return c.json({ events: result.rows });
});

adminRoutes.get("/whoami", authMiddleware, async (c) => {
  const auth = c.get("auth");
  if (!auth.userId) {
    return c.json({ is_admin: false });
  }
  const me = await query<{ email: string }>(
    "SELECT email FROM users WHERE id = $1",
    [auth.userId]
  );
  return c.json({ is_admin: isAdminEmail(me.rows[0]?.email) });
});
