import { query } from "../db/client.js";
import type { AuthContext } from "../middleware/auth.js";
import { notify } from "./notify.js";

export async function logAction(
  auth: AuthContext,
  workspaceId: string,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const actorType = auth.agentKeyId ? "agent" : "user";
  const actorId = auth.agentKeyId || auth.userId;
  if (!actorId) return;

  try {
    await query(
      `INSERT INTO audit_log (workspace_id, actor_type, actor_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        workspaceId,
        actorType,
        actorId,
        action,
        resourceType,
        resourceId || null,
        metadata || {},
      ]
    );
  } catch (e) {
    console.error("Audit log write failed:", e);
    return;
  }

  // First-agent-read signal — fires once per workspace, the first time an
  // agent key successfully calls anything. The extra count() query runs on
  // every agent action; cheap with the existing idx_audit_log_workspace
  // index, and worth it for design-partner visibility. Errors are swallowed
  // so a Slack outage never breaks the agent's request.
  if (actorType === "agent") {
    try {
      const counted = await query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_log
         WHERE workspace_id = $1 AND actor_type = 'agent'`,
        [workspaceId]
      );
      if (counted.rows[0]?.count === "1") {
        const ctx = await query<{ workspace_name: string; agent_key_name: string | null }>(
          `SELECT w.name AS workspace_name, k.name AS agent_key_name
           FROM workspaces w
           LEFT JOIN agent_keys k ON k.id = $2
           WHERE w.id = $1`,
          [workspaceId, auth.agentKeyId]
        );
        await notify({
          kind: "first_agent_read",
          workspaceId,
          workspaceName: ctx.rows[0]?.workspace_name || "(unknown)",
          agentKeyName: ctx.rows[0]?.agent_key_name || "(unknown)",
          action,
        });
      }
    } catch (e) {
      console.error("first_agent_read notify failed:", e);
    }
  }
}
