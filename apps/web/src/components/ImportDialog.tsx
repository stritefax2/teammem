import { useState, useRef, type FormEvent } from "react";
import { apiFetch } from "../lib/api.js";

interface Props {
  collectionId: string;
  onDone: () => void;
  onClose: () => void;
}

export function ImportDialog({ collectionId, onDone, onClose }: Props) {
  const [mode, setMode] = useState<"csv" | "json">("csv");
  const [rawText, setRawText] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    success: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRawText(reader.result as string);
    reader.readAsText(file);
  }

  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (values[i]) row[h] = values[i];
      });
      return row;
    });
  }

  async function handleImport(e: FormEvent) {
    e.preventDefault();
    setImporting(true);
    setResult(null);

    try {
      let entries: Record<string, unknown>[];

      if (mode === "csv") {
        const rows = parseCSV(rawText);
        entries = rows.map((row) => ({
          collection_id: collectionId,
          structured_data: row,
        }));
      } else {
        const parsed = JSON.parse(rawText);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        entries = items.map((item) => ({
          collection_id: collectionId,
          ...(typeof item.content === "string"
            ? { content: item.content, structured_data: item.structured_data }
            : { structured_data: item }),
        }));
      }

      let success = 0;
      const errors: string[] = [];

      for (const entry of entries) {
        try {
          await apiFetch("/api/v1/entries", {
            method: "POST",
            body: JSON.stringify(entry),
          });
          success++;
        } catch (err: any) {
          errors.push(err.message);
          if (errors.length >= 5) break;
        }
      }

      setResult({ success, errors });
      if (success > 0) onDone();
    } catch (err: any) {
      setResult({ success: 0, errors: [`Parse error: ${err.message}`] });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Import data</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleImport} className="px-6 py-5">
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setMode("csv")}
              className={`px-3 py-1.5 text-sm rounded-lg ${mode === "csv" ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-500 hover:bg-gray-100"}`}
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() => setMode("json")}
              className={`px-3 py-1.5 text-sm rounded-lg ${mode === "json" ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-500 hover:bg-gray-100"}`}
            >
              JSON
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-2">
              Upload a file or paste data below
            </label>
            <input
              type="file"
              accept={mode === "csv" ? ".csv" : ".json"}
              ref={fileInputRef}
              onChange={handleFile}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-900 hover:file:bg-gray-100"
            />
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={8}
            placeholder={
              mode === "csv"
                ? 'name,email,role\nAlice,alice@co.com,engineer\nBob,bob@co.com,designer'
                : '[{"name":"Alice","role":"engineer"},{"name":"Bob","role":"designer"}]'
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none resize-y"
          />

          {result && (
            <div
              className={`mt-3 p-3 rounded-lg text-sm ${result.errors.length > 0 ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"}`}
            >
              <p className="font-medium">
                {result.success} entries imported
                {result.errors.length > 0 &&
                  `, ${result.errors.length} errors`}
              </p>
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-600 mt-1">
                  {err}
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={importing || !rawText.trim()}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {importing
                ? "Importing..."
                : `Import ${mode.toUpperCase()}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 px-3 py-2 text-sm hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
