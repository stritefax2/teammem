import { useState, useRef, useEffect, type FormEvent } from "react";
import { apiFetch } from "../lib/api.js";

interface SearchResult {
  entry_id: string;
  collection: string;
  content: string | null;
  structured_data: Record<string, unknown> | null;
  relevance_score: number;
}

interface Message {
  role: "user" | "system";
  content: string;
  results?: SearchResult[];
}

export function AskPanel({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const query = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setLoading(true);

    try {
      const data = await apiFetch<{ results: SearchResult[] }>(
        "/api/v1/search",
        {
          method: "POST",
          body: JSON.stringify({ query, workspace_id: workspaceId, limit: 5 }),
        }
      );

      if (data.results.length === 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: "No matching entries found. Try a different question.",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: `Found ${data.results.length} relevant entries:`,
            results: data.results,
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Search failed: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "What decisions have we made recently?",
    "Show me active projects",
    "Find meeting notes from this week",
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl border-l border-gray-200 flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">Ask your workspace</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 mb-4">
              Search across all your workspace knowledge using natural language.
            </p>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="block w-full text-left text-sm text-gray-900 bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.role === "user" ? "flex justify-end" : "flex justify-start"
            }
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              <p>{msg.content}</p>
              {msg.results && (
                <div className="mt-2 space-y-2">
                  {msg.results.map((r) => (
                    <div
                      key={r.entry_id}
                      className="bg-white rounded-lg p-3 border border-gray-200"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-gray-900">
                          {r.collection}
                        </span>
                        <span className="text-xs text-gray-400">
                          {(r.relevance_score * 100).toFixed(0)}% match
                        </span>
                      </div>
                      {r.content && (
                        <p className="text-xs text-gray-700 line-clamp-3">
                          {r.content}
                        </p>
                      )}
                      {r.structured_data &&
                        Object.keys(r.structured_data).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(r.structured_data)
                              .slice(0, 4)
                              .map(([k, v]) => (
                                <span
                                  key={k}
                                  className="text-xs bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded"
                                >
                                  {k}: {String(v)}
                                </span>
                              ))}
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500">
              Searching...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 border-t border-gray-200"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your workspace..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            Ask
          </button>
        </div>
      </form>
    </div>
  );
}
