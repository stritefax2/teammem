import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

interface AuditEvent {
  id: string;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  agent_name: string | null;
}

export function ActivityFeed({
  workspaceId,
  limit = 20,
  refreshKey = 0,
}: {
  workspaceId: string;
  limit?: number;
  refreshKey?: number;
}) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ events: AuditEvent[] }>(
      `/api/v1/audit/${workspaceId}?limit=${limit}`
    )
      .then((data) => setEvents(data.events))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId, limit, refreshKey]);

  if (loading) {
    return (
      <div className="animate-pulse text-gray-400 text-xs py-4">
        Loading activity...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-gray-400 py-4">No activity yet.</p>
    );
  }

  const actionLabels: Record<string, string> = {
    create: "created",
    read: "viewed",
    update: "updated",
    delete: "deleted",
  };

  return (
    <div className="space-y-2">
      {events.map((e) => {
        const actor =
          e.actor_type === "agent"
            ? { name: e.agent_name || "Agent", isAgent: true }
            : {
                name: e.user_name || e.user_email || "User",
                isAgent: false,
              };

        return (
          <div
            key={e.id}
            className="flex items-start gap-2 text-xs text-gray-600"
          >
            {actor.isAgent ? (
              <span className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
                A
              </span>
            ) : (
              <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
                {actor.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <span className="font-medium text-gray-800">{actor.name}</span>{" "}
              {actionLabels[e.action] || e.action} {e.resource_type}
              {typeof e.metadata?.collection === "string" && (
                <span className="text-gray-400">
                  {" "}
                  in {e.metadata.collection}
                </span>
              )}
              <span className="block text-gray-400 mt-0.5">
                {timeAgo(new Date(e.created_at))}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
