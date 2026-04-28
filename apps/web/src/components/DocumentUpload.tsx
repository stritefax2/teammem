import { useState, useRef, type DragEvent, type FormEvent } from "react";
import { apiFetch } from "../lib/api.js";

interface Props {
  collectionId: string;
  onDone: () => void;
  onClose: () => void;
}

interface PendingFile {
  file: File;
  title: string;
  tags: string;
}

export function DocumentUpload({ collectionId, onDone, onClose }: Props) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<
    Array<{ name: string; error?: string }>
  >([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(fileList: FileList | File[]) {
    const accepted = Array.from(fileList).filter(
      (f) =>
        f.name.endsWith(".txt") ||
        f.name.endsWith(".md") ||
        f.name.endsWith(".csv") ||
        f.name.endsWith(".json") ||
        f.type === "text/plain" ||
        f.type === "text/markdown"
    );
    const newPending = accepted.map((f) => ({
      file: f,
      title: f.name.replace(/\.\w+$/, ""),
      tags: "",
    }));
    setPendingFiles((prev) => [...prev, ...newPending]);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  function updatePending(idx: number, field: "title" | "tags", value: string) {
    setPendingFiles((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
  }

  function removePending(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setUploading(true);
    const newResults: typeof results = [];

    for (const pending of pendingFiles) {
      try {
        const text = await pending.file.text();

        const metadata: Record<string, string> = {};
        if (pending.tags.trim()) {
          for (const tag of pending.tags.split(",")) {
            const trimmed = tag.trim();
            if (trimmed.includes(":")) {
              const [key, ...rest] = trimmed.split(":");
              metadata[key.trim()] = rest.join(":").trim();
            } else if (trimmed) {
              metadata[trimmed] = "true";
            }
          }
        }

        await apiFetch<{ entry_id: string }>("/api/v1/documents/store", {
          method: "POST",
          body: JSON.stringify({
            collection_id: collectionId,
            title: pending.title,
            content: text,
            source: pending.file.name,
            ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
          }),
        });

        newResults.push({ name: pending.title });
      } catch (err: any) {
        newResults.push({ name: pending.title, error: err.message });
      }
    }

    setResults(newResults);
    setUploading(false);
    if (newResults.some((r) => !r.error)) onDone();
  }

  const totalSuccess = results.filter((r) => !r.error).length;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-gray-900">Upload documents</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleUpload} className="flex-1 overflow-y-auto px-6 py-5">
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-gray-900 bg-gray-50"
                : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".txt,.md,.csv,.json"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
              className="hidden"
            />
            <p className="text-sm font-medium text-gray-700">
              Drop files here or click to browse
            </p>
            <p className="text-xs text-gray-400 mt-1">
              .txt, .md, .csv, .json — each stored as a searchable document
            </p>
          </div>

          {/* File list with editable titles and tags */}
          {pendingFiles.length > 0 && (
            <div className="mt-4 space-y-3">
              {pendingFiles.map((pf, idx) => (
                <div
                  key={idx}
                  className="bg-gray-50 rounded-lg p-3 border border-gray-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400 truncate">
                      {pf.file.name} ({(pf.file.size / 1024).toFixed(0)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={() => removePending(idx)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    type="text"
                    value={pf.title}
                    onChange={(e) => updatePending(idx, "title", e.target.value)}
                    placeholder="Document title"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none mb-2"
                  />
                  <input
                    type="text"
                    value={pf.tags}
                    onChange={(e) => updatePending(idx, "tags", e.target.value)}
                    placeholder="Tags: company:Tesla, year:2024, filing_type:10-K"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800">
                {totalSuccess} document{totalSuccess !== 1 ? "s" : ""} uploaded
                and indexed for search
              </p>
              {results
                .filter((r) => r.error)
                .map((r, i) => (
                  <p key={i} className="text-xs text-red-600 mt-1">
                    {r.name}: {r.error}
                  </p>
                ))}
            </div>
          )}

          <div className="flex gap-2 mt-5">
            <button
              type="submit"
              disabled={uploading || pendingFiles.length === 0}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {uploading
                ? "Uploading..."
                : `Upload ${pendingFiles.length} document${pendingFiles.length !== 1 ? "s" : ""}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 px-3 py-2 text-sm hover:text-gray-700"
            >
              {results.length > 0 ? "Done" : "Cancel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
