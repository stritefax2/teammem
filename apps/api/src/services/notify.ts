import { query } from "../db/client.js";

// Activity feed for the Prismian operator. Every milestone event the
// product cares about (signup, first source connected, first key, first
// agent read) lands here as one row, readable from /admin/activity.
//
// Failures never propagate — telemetry must never break a user action.

export type NotifyEvent =
  | {
      kind: "register";
      email: string;
      name?: string | null;
    }
  | {
      kind: "connect_source";
      userEmail: string;
      workspaceId: string;
      workspaceName: string;
      sourceType: string;
      sourceName: string;
    }
  | {
      kind: "generate_first_key";
      userEmail: string;
      workspaceId: string;
      workspaceName: string;
      keyName: string;
    }
  | {
      kind: "first_agent_read";
      workspaceId: string;
      workspaceName: string;
      agentKeyName: string;
      action: string;
    };

export async function notify(event: NotifyEvent): Promise<void> {
  let workspaceId: string | null = null;
  let workspaceName: string | null = null;
  let userEmail: string | null = null;
  const metadata: Record<string, unknown> = {};

  switch (event.kind) {
    case "register":
      userEmail = event.email;
      if (event.name) metadata.name = event.name;
      break;
    case "connect_source":
      workspaceId = event.workspaceId;
      workspaceName = event.workspaceName;
      userEmail = event.userEmail;
      metadata.source_type = event.sourceType;
      metadata.source_name = event.sourceName;
      break;
    case "generate_first_key":
      workspaceId = event.workspaceId;
      workspaceName = event.workspaceName;
      userEmail = event.userEmail;
      metadata.key_name = event.keyName;
      break;
    case "first_agent_read":
      workspaceId = event.workspaceId;
      workspaceName = event.workspaceName;
      metadata.agent_key_name = event.agentKeyName;
      metadata.action = event.action;
      break;
  }

  try {
    await query(
      `INSERT INTO activity_events
         (kind, workspace_id, workspace_name, user_email, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [event.kind, workspaceId, workspaceName, userEmail, metadata]
    );
  } catch (e) {
    console.error("[notify] activity_events insert failed:", e);
  }
}
