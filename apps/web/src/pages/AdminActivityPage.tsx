import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { apiFetch, ApiError } from "../lib/api.js";

interface ActivityEvent {
  id: string;
  kind: string;
  workspace_id: string | null;
  workspace_name: string | null;
  user_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const KINDS = [
  { value: "", label: "All events" },
  { value: "register", label: "Signups" },
  { value: "connect_source", label: "Sources connected" },
  { value: "generate_first_key", label: "First agent key" },
  { value: "first_agent_read", label: "First agent read" },
];

function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function describe(e: ActivityEvent): { icon: string; line: string } {
  const md = e.metadata || {};
  switch (e.kind) {
    case "register":
      return {
        icon: "👋",
        line: `${e.user_email}${md.name ? ` (${md.name})` : ""} signed up`,
      };
    case "connect_source":
      return {
        icon: "🔌",
        line: `${e.user_email} connected ${md.source_type} "${md.source_name}" in ${e.workspace_name}`,
      };
    case "generate_first_key":
      return {
        icon: "🔑",
        line: `${e.user_email} created first agent key "${md.key_name}" in ${e.workspace_name}`,
      };
    case "first_agent_read":
      return {
        icon: "🤖",
        line: `Agent "${md.agent_key_name}" first read in ${e.workspace_name} (${md.action})`,
      };
    default:
      return { icon: "•", line: e.kind };
  }
}

export function AdminActivityPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [kind, setKind] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    const path = `/api/v1/admin/activity${kind ? `?kind=${kind}` : ""}`;
    apiFetch<{ events: ActivityEvent[] }>(path)
      .then((data) => setEvents(data.events))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 403) {
          setError("Forbidden — your account is not in ADMIN_EMAILS.");
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => setLoading(false));
  }, [kind, refreshKey]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <Link to="/dashboard" className="font-bold text-gray-900">
            Prismian
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium">Admin · Activity</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-400 hidden sm:block">
              {user?.email}
            </span>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Activity feed</h1>
            <p className="text-sm text-gray-500 mt-1">
              Cross-workspace milestones for design-partner phase. Operator-only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="text-sm rounded-md border border-gray-300 bg-white px-3 py-1.5"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="text-sm rounded-md border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-800">
            {error}
            {error.startsWith("Forbidden") && (
              <button
                onClick={() => navigate("/dashboard")}
                className="ml-2 underline"
              >
                Go to dashboard
              </button>
            )}
          </div>
        )}

        {loading && !error && (
          <div className="text-sm text-gray-500">Loading…</div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            No events yet. Sign up a new user, connect a source, or have an
            agent call the API to populate this feed.
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-white divide-y divide-gray-100">
            {events.map((e) => {
              const { icon, line } = describe(e);
              return (
                <div
                  key={e.id}
                  className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50"
                >
                  <span className="text-lg leading-6">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{line}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {relativeTime(e.created_at)} ·{" "}
                      {new Date(e.created_at).toLocaleString()}
                    </p>
                  </div>
                  {e.workspace_id && (
                    <Link
                      to={`/w/${e.workspace_id}`}
                      className="text-xs text-gray-500 hover:text-gray-900 shrink-0"
                    >
                      Open →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
