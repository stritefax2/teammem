import { Hono } from "hono";
import { query, transaction } from "../db/client.js";
import { authMiddleware, requireWorkspaceMember } from "../middleware/auth.js";
import { createWorkspaceSchema, inviteMemberSchema } from "@teammem/shared";
import { supabaseAdmin } from "../lib/supabase.js";
import type { AppEnv } from "../types.js";

export const workspaceRoutes = new Hono<AppEnv>();

workspaceRoutes.use("*", authMiddleware);

workspaceRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  if (!auth.userId) {
    return c.json({ error: "User session required" }, 400);
  }

  const result = await query(
    `SELECT w.* FROM workspaces w
     INNER JOIN workspace_members wm ON w.id = wm.workspace_id
     WHERE wm.user_id = $1 AND wm.accepted_at IS NOT NULL
     ORDER BY w.created_at DESC`,
    [auth.userId]
  );

  return c.json({ workspaces: result.rows });
});

workspaceRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  if (!auth.userId) {
    return c.json({ error: "User session required" }, 400);
  }

  const body = await c.req.json();
  const parsed = createWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const workspace = await transaction(async (client) => {
    const ws = await client.query(
      "INSERT INTO workspaces (name, created_by, settings) VALUES ($1, $2, $3) RETURNING *",
      [parsed.data.name, auth.userId, parsed.data.settings || {}]
    );
    await client.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role, accepted_at) VALUES ($1, $2, 'owner', now())",
      [ws.rows[0].id, auth.userId]
    );
    return ws.rows[0];
  });

  return c.json({ workspace }, 201);
});

workspaceRoutes.get("/:id", requireWorkspaceMember, async (c) => {
  const id = c.req.param("id");
  const result = await query("SELECT * FROM workspaces WHERE id = $1", [id]);

  if (result.rows.length === 0) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  return c.json({ workspace: result.rows[0] });
});

workspaceRoutes.get("/:id/members", requireWorkspaceMember, async (c) => {
  const id = c.req.param("id");
  const result = await query(
    `SELECT u.id, u.email, u.name, wm.role, wm.invited_at, wm.accepted_at
     FROM workspace_members wm
     INNER JOIN users u ON wm.user_id = u.id
     WHERE wm.workspace_id = $1
     ORDER BY wm.invited_at`,
    [id]
  );

  // Also get pending invites (users who haven't registered yet)
  const pendingResult = await query(
    `SELECT id, email, role, invited_at FROM workspace_invites
     WHERE workspace_id = $1 AND accepted_at IS NULL
     ORDER BY invited_at`,
    [id]
  );

  return c.json({
    members: result.rows,
    pending_invites: pendingResult.rows,
  });
});

workspaceRoutes.post("/:id/invite", requireWorkspaceMember, async (c) => {
  const workspaceId = c.req.param("id");
  const body = await c.req.json();
  const parsed = inviteMemberSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const email = parsed.data.email;
  const role = parsed.data.role;

  // Check if already a member
  const existingUser = await query("SELECT id FROM users WHERE email = $1", [email]);

  if (existingUser.rows.length > 0) {
    const userId = existingUser.rows[0].id;
    const existingMember = await query(
      "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
      [workspaceId, userId]
    );
    if (existingMember.rows.length > 0) {
      return c.json({ error: "User is already a member" }, 409);
    }

    // User exists — add directly
    await query(
      "INSERT INTO workspace_members (workspace_id, user_id, role, accepted_at) VALUES ($1, $2, $3, now())",
      [workspaceId, userId, role]
    );
    return c.json({ message: "Member added", status: "added" }, 201);
  }

  // User doesn't exist — send Supabase invite email + store pending invite
  try {
    // Check if already invited
    const existingInvite = await query(
      "SELECT 1 FROM workspace_invites WHERE workspace_id = $1 AND email = $2 AND accepted_at IS NULL",
      [workspaceId, email]
    );
    if (existingInvite.rows.length > 0) {
      return c.json({ error: "Invite already pending for this email" }, 409);
    }

    // Get workspace name for the invite email
    const wsResult = await query("SELECT name FROM workspaces WHERE id = $1", [workspaceId]);
    const workspaceName = wsResult.rows[0]?.name || "a workspace";

    // Invite via Supabase Auth (sends email automatically)
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        workspace_id: workspaceId,
        workspace_name: workspaceName,
        invited_role: role,
      },
      redirectTo: `${process.env.WEB_URL || "http://localhost:5173"}/invite/accept?workspace=${workspaceId}`,
    });

    if (inviteError) {
      // If Supabase can't send email (e.g. email not configured), still store the invite
      console.error("Supabase invite email failed:", inviteError.message);
    }

    // Store the pending invite
    await query(
      "INSERT INTO workspace_invites (workspace_id, email, role, invited_by) VALUES ($1, $2, $3, $4)",
      [workspaceId, email, role, c.get("auth").userId]
    );

    return c.json({
      message: inviteError
        ? "Invite saved. Share the registration link with them manually."
        : "Invite email sent",
      status: "invited",
    }, 201);
  } catch (e: any) {
    if (e.code === "23505") {
      return c.json({ error: "Invite already pending for this email" }, 409);
    }
    throw e;
  }
});

// Accept a pending invite (called after user registers via invite link)
workspaceRoutes.post("/:id/accept-invite", authMiddleware, async (c) => {
  const workspaceId = c.req.param("id");
  const auth = c.get("auth");
  if (!auth.userId) {
    return c.json({ error: "User session required" }, 400);
  }

  const userResult = await query("SELECT email FROM users WHERE id = $1", [auth.userId]);
  if (userResult.rows.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  const email = userResult.rows[0].email;

  const invite = await query(
    "SELECT role FROM workspace_invites WHERE workspace_id = $1 AND email = $2 AND accepted_at IS NULL",
    [workspaceId, email]
  );

  if (invite.rows.length === 0) {
    return c.json({ error: "No pending invite found" }, 404);
  }

  await transaction(async (client) => {
    await client.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role, accepted_at) VALUES ($1, $2, $3, now()) ON CONFLICT DO NOTHING",
      [workspaceId, auth.userId, invite.rows[0].role]
    );
    await client.query(
      "UPDATE workspace_invites SET accepted_at = now() WHERE workspace_id = $1 AND email = $2",
      [workspaceId, email]
    );
  });

  return c.json({ message: "Invite accepted" });
});
