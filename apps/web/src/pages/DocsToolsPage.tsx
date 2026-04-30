import { Link } from "react-router-dom";

interface Tool {
  name: string;
  category: "read" | "write";
  summary: string;
  whenToUse: string[];
  whenNotToUse: string[];
  exampleCall: string;
  exampleResult: string;
}

const TOOLS: Tool[] = [
  {
    name: "list_collections",
    category: "read",
    summary:
      "Lists every collection the caller can access, with schema info, source table, and which tools are recommended per collection. Call this first in any new conversation.",
    whenToUse: [
      "Starting a new conversation and you need to know what's available",
      "User asks 'what data do I have?' — this is the answer",
      "You need a collection's UUID to pass to query_structured / aggregate",
    ],
    whenNotToUse: [
      "You already know the collection ID and just need to query it — go straight to query_structured",
    ],
    exampleCall: `// no parameters — returns everything the key has access to
list_collections()`,
    exampleResult: `[
  {
    "id": "c9b0...",
    "name": "user_profiles",
    "synced": true,
    "writable": false,
    "source": "public.user_profiles",
    "queryable_fields": ["id", "email", "name", "created_at"],
    "primary_key": "id",
    "content_column": null,
    "searchable_by_text": false,
    "entry_count": 26,
    "recommended_tools": [
      "query_structured (field filters)",
      "aggregate (count/sum/avg/group_by)"
    ]
  }
]`,
  },
  {
    name: "query_structured",
    category: "read",
    summary:
      "Filters and sorts rows by exact field values. The right tool when the user gives you concrete predicates ('active', '> 1000', 'this month').",
    whenToUse: [
      "User asks for rows matching specific field values",
      "Synced collection that has no content_column (search would return nothing)",
      "You need typed predicates, ordering, or pagination",
    ],
    whenNotToUse: [
      "User asks a fuzzy natural-language question — use search instead",
      "User wants summary stats (count, sum, avg) — use aggregate instead",
    ],
    exampleCall: `query_structured({
  collection: "c9b0...",
  filters: [
    { field: "status", op: "eq", value: "at_risk" },
    { field: "mrr", op: "gt", value: 1000 }
  ],
  sort_by: "mrr",
  limit: 10
})`,
    exampleResult: `{
  "results": [
    { "id": "...", "name": "Northwind", "status": "at_risk", "mrr": 18600 },
    { "id": "...", "name": "Contoso",   "status": "at_risk", "mrr": 21000 }
  ],
  "total": 4
}`,
  },
  {
    name: "aggregate",
    category: "read",
    summary:
      "Safe analytics — count, sum, avg, min, max, group_by, having. Validated field names; never raw SQL. The right tool when the user wants summary stats.",
    whenToUse: [
      "Counting rows by category ('how many enterprise customers')",
      "Computing totals, averages, max/min over a numeric field",
      "Grouping (e.g. revenue by plan)",
    ],
    whenNotToUse: [
      "User wants the actual rows, not a summary — use query_structured",
    ],
    exampleCall: `aggregate({
  collection: "c9b0...",
  group_by: ["plan"],
  aggregations: [
    { op: "count", alias: "n" },
    { op: "sum",   field: "mrr", alias: "total_mrr" }
  ],
  order_by: { alias: "total_mrr", direction: "desc" }
})`,
    exampleResult: `[
  { "plan": "enterprise", "n": 12, "total_mrr": 312000 },
  { "plan": "team",       "n": 24, "total_mrr": 48000 },
  { "plan": "solo",       "n": 18, "total_mrr": 1800 }
]`,
  },
  {
    name: "search",
    category: "read",
    summary:
      "Natural-language search over text content. Semantic similarity (when OPENAI_API_KEY is configured) or full-text fallback.",
    whenToUse: [
      "User asks a fuzzy question that's looking inside prose ('mentions pricing pushback')",
      "Native collections (documents, decisions, meeting notes)",
      "Synced collections that have a content_column",
    ],
    whenNotToUse: [
      "Synced collection with no content_column — search returns nothing",
      "Filter by exact field value — use query_structured",
    ],
    exampleCall: `search({
  query: "customers worried about pricing",
  limit: 5
})`,
    exampleResult: `{
  "results": [
    {
      "entry_id": "...",
      "collection_id": "...",
      "collection": "Decisions",
      "content": "Northwind flagged pricing pushback at the QBR...",
      "relevance_score": 0.87
    }
  ]
}`,
  },
  {
    name: "read_entry",
    category: "read",
    summary:
      "Fetches a single full row by entry ID. Use after query_structured / search returns results when you need every field of a particular row.",
    whenToUse: [
      "User asks 'show me the full record for X'",
      "Following up on a search result — you have the entry_id, want the full content",
    ],
    whenNotToUse: [
      "Listing many rows — use query_structured with a filter",
    ],
    exampleCall: `read_entry({ entry_id: "..." })`,
    exampleResult: `{
  "entry": {
    "id": "...",
    "collection_id": "...",
    "structured_data": { "name": "Northwind", "plan": "enterprise" },
    "content": "...full markdown if any...",
    "version": 3
  }
}`,
  },
  {
    name: "workspace_info",
    category: "read",
    summary:
      "One call to orient at the start of a session: workspace name, every collection's name and shape, sync freshness. Reduces multi-call setup.",
    whenToUse: [
      "Beginning of a session, need full picture in one call",
      "Reporting / dashboard-style summary tasks",
    ],
    whenNotToUse: [
      "You already know which collection to query — list_collections is lighter",
    ],
    exampleCall: `workspace_info()`,
    exampleResult: `{
  "workspace": { "name": "Acme Corp" },
  "collections": [ /* same shape as list_collections */ ]
}`,
  },
  {
    name: "write_entry",
    category: "write",
    summary:
      "Creates a new entry in a writable (native) collection. Refuses on synced collections — those are structurally read-only.",
    whenToUse: [
      "Logging a decision, observation, or note for later retrieval",
      "Persisting agent-generated structured data the team will see",
    ],
    whenNotToUse: [
      "Writing to a synced collection — will return 409 read_only_source",
      "Updating an existing entry — use update_entry instead",
    ],
    exampleCall: `write_entry({
  collection_id: "...",
  structured_data: { category: "research", topic: "ARM IPO" },
  content: "Notes on ARM's S-1..."
})`,
    exampleResult: `{
  "entry": { "id": "...", "version": 1 }
}`,
  },
  {
    name: "update_entry",
    category: "write",
    summary:
      "Updates an existing entry with optimistic locking. Pass the version you read; if it's stale, the API rejects with a conflict so you can re-read and merge.",
    whenToUse: [
      "Refining a previous note as the conversation continues",
      "Adding a tag or correction to an existing entry",
    ],
    whenNotToUse: [
      "Creating a new entry — use write_entry",
      "Source-backed (synced) collection — rejected with 409",
    ],
    exampleCall: `update_entry({
  entry_id: "...",
  structured_data: { category: "research", priority: "high" },
  version: 1   // version you read; bumps to 2 on success
})`,
    exampleResult: `{
  "entry": { "id": "...", "version": 2 }
}`,
  },
];

export function DocsToolsPage() {
  const reads = TOOLS.filter((t) => t.category === "read");
  const writes = TOOLS.filter((t) => t.category === "write");

  return (
    <div className="min-h-screen bg-white antialiased">
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-lg border-b border-gray-100 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              to="/"
              className="text-xl font-bold text-gray-900 tracking-tight"
            >
              Prismian
            </Link>
            <nav className="hidden sm:flex items-center gap-6 text-sm text-gray-600">
              <Link to="/" className="hover:text-gray-900 transition-colors">
                Home
              </Link>
              <span className="text-gray-900">Docs</span>
              <a
                href="https://github.com/stritefax2/teammem"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-900 transition-colors"
              >
                GitHub
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="bg-gray-900 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-32 pb-24 max-w-3xl mx-auto px-4 sm:px-6">
        {/* Lede */}
        <div className="mb-12">
          <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-3">
            Docs · MCP tools
          </p>
          <h1 className="text-4xl font-semibold text-gray-900 tracking-tight leading-[1.1]">
            What your agents actually get
          </h1>
          <p className="mt-4 text-lg text-gray-500 leading-relaxed">
            Eight tools, wired automatically when you paste the MCP config.
            Schema-aware, scope-enforced, audited. The agent (Claude,
            Cursor, ChatGPT, anything MCP-compatible) sees them in its
            tool palette and decides which to call based on your question.
          </p>
        </div>

        {/* Quick reference */}
        <div className="mb-12 bg-gray-50 border border-gray-200 rounded-md p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-3">
            Quick reference
          </p>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {TOOLS.map((t) => (
              <a
                key={t.name}
                href={`#${t.name}`}
                className="flex items-center gap-2 text-gray-700 hover:text-gray-900 group"
              >
                <code className="text-xs font-mono bg-white border border-gray-200 px-1.5 py-0.5 rounded group-hover:border-gray-300">
                  {t.name}
                </code>
                <span className="text-xs text-gray-500 truncate">
                  {t.summary.split(".")[0]}
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* Read tools */}
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          Read tools
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Six tools for finding, filtering, and reading data. Permission
          and column-redaction enforced before any row leaves the API.
        </p>
        <div className="space-y-10 mb-16">
          {reads.map((t) => (
            <ToolBlock key={t.name} tool={t} />
          ))}
        </div>

        {/* Write tools */}
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          Write tools
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Two tools for persisting agent-generated content into native
          (writable) collections. Synced collections are structurally
          read-only — write attempts return{" "}
          <code className="text-xs bg-gray-100 border border-gray-200 px-1 rounded font-mono">
            409 read_only_source
          </code>
          .
        </p>
        <div className="space-y-10 mb-16">
          {writes.map((t) => (
            <ToolBlock key={t.name} tool={t} />
          ))}
        </div>

        {/* Footer CTA */}
        <div className="bg-gray-950 rounded-xl ring-1 ring-gray-200 shadow-lg shadow-gray-900/[0.04] p-6 text-center">
          <h3 className="text-lg font-semibold text-white">
            Ready to wire it up?
          </h3>
          <p className="mt-2 text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
            Connect a Postgres source, generate a scoped agent key, paste
            the MCP config into Claude Desktop / Cursor — done in 5
            minutes.
          </p>
          <Link
            to="/register"
            className="mt-5 inline-flex items-center gap-1.5 bg-white text-gray-900 px-5 py-2 rounded-md text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            Get started — free
          </Link>
        </div>
      </main>
    </div>
  );
}

function ToolBlock({ tool }: { tool: Tool }) {
  return (
    <section id={tool.name} className="scroll-mt-24">
      <div className="flex items-baseline gap-3 mb-2">
        <code className="text-base font-mono text-gray-900 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded font-medium">
          {tool.name}
        </code>
        <span
          className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${
            tool.category === "read"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-gray-900 text-white"
          }`}
        >
          {tool.category}
        </span>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed mb-4">
        {tool.summary}
      </p>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <div className="bg-emerald-50/40 border border-emerald-100 rounded-md p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-700 mb-1.5">
            When to use
          </p>
          <ul className="text-xs text-gray-700 space-y-1 leading-relaxed">
            {tool.whenToUse.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-emerald-600 shrink-0">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-amber-50/40 border border-amber-100 rounded-md p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-amber-700 mb-1.5">
            When not to use
          </p>
          <ul className="text-xs text-gray-700 space-y-1 leading-relaxed">
            {tool.whenNotToUse.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-600 shrink-0">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="bg-gray-950 rounded-md ring-1 ring-gray-900 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-gray-800 bg-gray-900/60">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
              example call
            </span>
          </div>
          <pre className="text-[11px] text-gray-300 overflow-x-auto leading-relaxed p-3 font-mono">
            {tool.exampleCall}
          </pre>
        </div>
        <div className="bg-gray-950 rounded-md ring-1 ring-gray-900 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-gray-800 bg-gray-900/60">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
              example response
            </span>
          </div>
          <pre className="text-[11px] text-emerald-300 overflow-x-auto leading-relaxed p-3 font-mono">
            {tool.exampleResult}
          </pre>
        </div>
      </div>
    </section>
  );
}
