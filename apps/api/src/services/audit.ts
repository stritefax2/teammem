import { query } from "../db/client.js";
import type { AuthContext } from "../middleware/auth.js";

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
  ).catch((e) => console.error("Audit log write failed:", e));
}
