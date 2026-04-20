import { useState, type FormEvent } from "react";
import { apiFetch } from "../lib/api.js";

interface DataSource {
  id: string;
  workspace_id: string;
  name: string;
  source_type: string;
  status: string;
  last_sync_at: string | null;
  created_at: string;
}

export function ConnectDataSource({
  workspaceId,
  onClose,
  onConnected,
}: {
  workspaceId: string;
  onClose: () => void;
  onConnected: (ds: DataSource) => void;
}) {
  const [name, setName] = useState("");
  const [connectionString, setConnectionString] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const data = await apiFetch<{ data_source: DataSource }>(
        "/api/v1/data-sources",
        {
          method: "POST",
          body: JSON.stringify({
            workspace_id: workspaceId,
            name,
            source_type: "postgres",
            connection_string: connectionString,
          }),
        }
      );
      onConnected(data.data_source);
    } catch (err: any) {
      setError(err.message || "Failed to connect");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            Connect a Postgres database
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">
              Connection name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Supabase Prod, Analytics DB"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <span className="block mt-1 text-xs text-gray-500">
              Just a label — pick something memorable.
            </span>
          </label>

          <label className="block mb-3">
            <span className="text-sm font-medium text-gray-700">
              Connection string
            </span>
            <textarea
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              required
              rows={3}
              placeholder="postgres://readonly_user:password@db.example.com:5432/prod?sslmode=require"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-y"
            />
            <span className="block mt-1 text-xs text-gray-500">
              Strongly recommended: a role with{" "}
              <code className="bg-gray-100 px-1 rounded">SELECT</code> only on
              the tables you want to expose. We encrypt this at rest and
              never return it in plaintext.
            </span>
          </label>

          <details className="mb-4 bg-gray-50 rounded-lg border border-gray-200 group">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-gray-700 hover:text-gray-900 list-none flex items-center justify-between">
              <span>Where to find this connection string</span>
              <span className="text-gray-400 group-open:rotate-180 transition-transform">
                ▾
              </span>
            </summary>
            <div className="px-3 py-3 border-t border-gray-200 space-y-3 text-xs text-gray-700">
              <div>
                <p className="font-semibold text-gray-900">Supabase</p>
                <ol className="mt-1 space-y-0.5 list-decimal list-inside text-gray-600">
                  <li>
                    Project dashboard →{" "}
                    <span className="font-medium">Project Settings</span> →{" "}
                    <span className="font-medium">Database</span>
                  </li>
                  <li>
                    Under <span className="font-medium">Connection string</span>
                    , pick <span className="font-medium">URI</span> and copy
                    the <span className="font-medium">Session pooler</span>{" "}
                    string
                  </li>
                  <li>
                    Replace <code className="bg-white px-1 rounded">[YOUR-PASSWORD]</code>{" "}
                    with your DB password (or, better, create a{" "}
                    <code className="bg-white px-1 rounded">read_only</code>{" "}
                    role in SQL Editor and use its password)
                  </li>
                </ol>
              </div>

              <div>
                <p className="font-semibold text-gray-900">Neon</p>
                <ol className="mt-1 space-y-0.5 list-decimal list-inside text-gray-600">
                  <li>
                    Project dashboard →{" "}
                    <span className="font-medium">Connection Details</span>
                  </li>
                  <li>
                    Copy the <span className="font-medium">Connection string</span>
                    , keep <code className="bg-white px-1 rounded">?sslmode=require</code>{" "}
                    on the end
                  </li>
                </ol>
              </div>

              <div>
                <p className="font-semibold text-gray-900">
                  Create a read-only role (recommended)
                </p>
                <pre className="mt-1 bg-white rounded border border-gray-200 p-2 overflow-x-auto text-[11px] leading-tight text-gray-800">
{`CREATE ROLE teammem_readonly WITH LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE your_db TO teammem_readonly;
GRANT USAGE ON SCHEMA public TO teammem_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO teammem_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO teammem_readonly;`}
                </pre>
              </div>
            </div>
          </details>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium text-blue-900">
              What happens when you click Connect
            </p>
            <ol className="mt-1.5 text-xs text-blue-800 space-y-0.5 list-decimal list-inside">
              <li>We run <code>SELECT 1</code> to verify the connection.</li>
              <li>Your connection string is AES-GCM encrypted and stored.</li>
              <li>
                You'll pick which tables to expose as collections, one at a
                time.
              </li>
              <li>Agents never see the raw connection string.</li>
            </ol>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !connectionString.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Testing connection..." : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
