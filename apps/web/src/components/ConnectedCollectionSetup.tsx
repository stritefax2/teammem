import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

interface DataSourceTable {
  schema: string;
  name: string;
  columns: Array<{
    name: string;
    data_type: string;
    is_nullable: boolean;
    is_primary_key: boolean;
  }>;
}

interface Collection {
  id: string;
  name: string;
  source_id: string | null;
}

// Data types that are reasonable as an embedding "content" column.
const TEXT_LIKE_TYPES = new Set([
  "text",
  "character varying",
  "varchar",
  "character",
  "bpchar",
]);

export function ConnectedCollectionSetup({
  workspaceId,
  dataSourceId,
  dataSourceName,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  dataSourceId: string;
  dataSourceName: string;
  onClose: () => void;
  onCreated: (collection: Collection) => void;
}) {
  const [tables, setTables] = useState<DataSourceTable[] | null>(null);
  const [introspectError, setIntrospectError] = useState("");
  const [selectedTable, setSelectedTable] = useState<DataSourceTable | null>(
    null
  );
  const [collectionName, setCollectionName] = useState("");
  const [primaryKey, setPrimaryKey] = useState<string>("");
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());
  const [contentCol, setContentCol] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    apiFetch<{ tables: DataSourceTable[] }>(
      `/api/v1/data-sources/${dataSourceId}/introspect`,
      { method: "POST" }
    )
      .then((data) => setTables(data.tables))
      .catch((e) => setIntrospectError(e.message));
  }, [dataSourceId]);

  function pickTable(t: DataSourceTable) {
    setSelectedTable(t);
    setCollectionName(t.name);
    const pk = t.columns.find((c) => c.is_primary_key);
    setPrimaryKey(pk?.name || "");
    setSelectedCols(new Set(t.columns.map((c) => c.name)));
    setContentCol("");
  }

  function toggleCol(name: string) {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleCreate() {
    if (!selectedTable || !primaryKey || selectedCols.size === 0) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const qualifiedTable =
        selectedTable.schema === "public"
          ? selectedTable.name
          : `${selectedTable.schema}.${selectedTable.name}`;

      const data = await apiFetch<{ collection: Collection }>(
        "/api/v1/collections",
        {
          method: "POST",
          body: JSON.stringify({
            workspace_id: workspaceId,
            name: collectionName,
            collection_type: "structured",
            source_id: dataSourceId,
            source_config: {
              table: qualifiedTable,
              primary_key: primaryKey,
              columns: Array.from(selectedCols),
              content_column: contentCol || undefined,
            },
          }),
        }
      );
      onCreated(data.collection);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to create connected collection");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">
              Add connected collection
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              from {dataSourceName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {introspectError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              Couldn't read schema: {introspectError}
            </div>
          )}

          {!tables && !introspectError && (
            <div className="py-12 text-center text-sm text-gray-400 animate-pulse">
              Reading schema from database...
            </div>
          )}

          {/* Step 1: pick a table */}
          {tables && !selectedTable && (
            <div>
              <h3 className="text-sm font-medium text-gray-800 mb-3">
                Pick a table
              </h3>
              {tables.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No tables found in this database.
                </p>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                  {tables.map((t) => {
                    const qualified = `${t.schema}.${t.name}`;
                    const pk = t.columns.find((c) => c.is_primary_key);
                    return (
                      <button
                        key={qualified}
                        onClick={() => pickTable(t)}
                        disabled={!pk}
                        className="w-full flex items-center justify-between text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200"
                        title={
                          !pk
                            ? "This table has no primary key and can't be synced yet."
                            : ""
                        }
                      >
                        <div>
                          <code className="text-sm font-mono text-gray-900">
                            {qualified}
                          </code>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {t.columns.length} columns
                            {pk
                              ? `, PK: ${pk.name}`
                              : " — no primary key (skipped)"}
                          </p>
                        </div>
                        {pk && (
                          <span className="text-xs text-blue-600 font-medium">
                            Select →
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 2: configure columns */}
          {selectedTable && (
            <div>
              <button
                onClick={() => setSelectedTable(null)}
                className="text-xs text-gray-500 hover:text-gray-700 mb-4"
              >
                ← Pick a different table
              </button>

              <label className="block mb-4">
                <span className="text-sm font-medium text-gray-700">
                  Collection name
                </span>
                <input
                  type="text"
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </label>

              <label className="block mb-4">
                <span className="text-sm font-medium text-gray-700">
                  Primary key column
                </span>
                <select
                  value={primaryKey}
                  onChange={(e) => setPrimaryKey(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  {selectedTable.columns
                    .filter((c) => !c.is_nullable)
                    .map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.data_type})
                        {c.is_primary_key ? " — detected" : ""}
                      </option>
                    ))}
                </select>
                <span className="block mt-1 text-xs text-gray-500">
                  Used to track rows across syncs and deduplicate.
                </span>
              </label>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Columns to expose ({selectedCols.size} of{" "}
                    {selectedTable.columns.length})
                  </span>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedCols(
                          new Set(selectedTable.columns.map((c) => c.name))
                        )
                      }
                      className="text-blue-600 hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCols(new Set([primaryKey]))}
                      className="text-gray-500 hover:underline"
                    >
                      Only PK
                    </button>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {selectedTable.columns.map((col) => (
                    <label
                      key={col.name}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCols.has(col.name)}
                        onChange={() => toggleCol(col.name)}
                        disabled={col.name === primaryKey}
                        className="rounded"
                      />
                      <code className="text-xs font-mono text-gray-800 flex-1">
                        {col.name}
                      </code>
                      <span className="text-xs text-gray-400">
                        {col.data_type}
                      </span>
                      {col.name === primaryKey && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                          PK
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <label className="block mb-4">
                <span className="text-sm font-medium text-gray-700">
                  Content column for embeddings{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </span>
                <select
                  value={contentCol}
                  onChange={(e) => setContentCol(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="">None — structured data only</option>
                  {selectedTable.columns
                    .filter(
                      (c) =>
                        selectedCols.has(c.name) &&
                        TEXT_LIKE_TYPES.has(c.data_type)
                    )
                    .map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.data_type})
                      </option>
                    ))}
                </select>
                <span className="block mt-1 text-xs text-gray-500">
                  If you pick one, semantic search queries will embed and
                  search this column's text.
                </span>
              </label>

              {submitError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {submitError}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={
                    submitting ||
                    !collectionName.trim() ||
                    !primaryKey ||
                    selectedCols.size === 0
                  }
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Creating..." : "Create & sync"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
