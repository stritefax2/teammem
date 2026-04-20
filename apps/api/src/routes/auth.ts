import { Hono } from "hono";
import { query } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/me", authMiddleware, async (c) => {
  const auth = c.get("auth");
  if (!auth.userId) {
    return c.json({ error: "Not a user session" }, 400);
  }

  const result = await query(
    "SELECT id, email, name, created_at FROM users WHERE id = $1",
    [auth.userId]
  );

  if (result.rows.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user: result.rows[0] });
});
