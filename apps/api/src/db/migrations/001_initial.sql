CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Users table synced from Supabase Auth (upserted on first API call)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  settings JSONB DEFAULT '{}'
);

CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE agent_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  permissions JSONB NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  schema JSONB,
  collection_type TEXT NOT NULL CHECK (collection_type IN ('structured', 'documents', 'mixed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  structured_data JSONB,
  content TEXT,
  created_by UUID REFERENCES users(id),
  created_by_agent UUID REFERENCES agent_keys(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  version INTEGER DEFAULT 1,
  embedding vector(1536)
);

CREATE TABLE entry_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES entries(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  structured_data JSONB,
  content TEXT,
  changed_by UUID REFERENCES users(id),
  changed_by_agent UUID REFERENCES agent_keys(id),
  changed_at TIMESTAMPTZ DEFAULT now(),
  change_type TEXT CHECK (change_type IN ('create', 'update', 'delete')),
  UNIQUE (entry_id, version)
);

CREATE TABLE entry_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES entries(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  UNIQUE (entry_id, chunk_index)
);

CREATE INDEX idx_entries_workspace ON entries (workspace_id);
CREATE INDEX idx_entries_collection ON entries (collection_id);
CREATE INDEX idx_entries_structured ON entries USING gin (structured_data);
CREATE INDEX idx_entries_content_fts ON entries USING gin (to_tsvector('english', content));

-- Enable Supabase Realtime for entries table. The supabase_realtime
-- publication exists on Supabase projects but not on plain Postgres
-- (e.g. local docker, self-hosted). Guard so this migration is safe
-- in both environments — realtime is a UX enhancement, not a
-- correctness requirement.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE entries;
  END IF;
END
$$;
