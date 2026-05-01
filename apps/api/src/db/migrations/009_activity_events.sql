-- Cross-workspace activity feed for the Prismian operator (you).
-- Distinct from audit_log, which is per-workspace and visible to that
-- workspace's members. activity_events is global, owner-only, and only
-- captures the high-signal milestones we want a feed of.
--
-- workspace_id is nullable because 'register' has no workspace yet.

CREATE TABLE activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  workspace_name TEXT,
  user_email TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_events_created_at ON activity_events (created_at DESC);
CREATE INDEX idx_activity_events_kind ON activity_events (kind, created_at DESC);

-- Lock the table to service-role access only. The API uses the service-
-- role Postgres connection (bypasses RLS), and the only legitimate reader
-- is the operator's /admin/activity endpoint which already enforces
-- ADMIN_EMAILS. We deliberately add NO policies so anon and authenticated
-- Supabase keys can't see or write this table directly.
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
