-- Row Level Security policies for Supabase
-- These protect data at the Postgres level, in addition to our API middleware checks.

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_keys ENABLE ROW LEVEL SECURITY;

-- Workspaces: users can see workspaces they're members of
CREATE POLICY workspace_member_select ON workspaces FOR SELECT
  USING (id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL));

CREATE POLICY workspace_insert ON workspaces FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Workspace members: visible to other members of the same workspace
CREATE POLICY members_select ON workspace_members FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid() AND wm.accepted_at IS NOT NULL));

-- Collections: visible to workspace members
CREATE POLICY collections_select ON collections FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL));

CREATE POLICY collections_insert ON collections FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL AND role IN ('owner', 'editor')));

-- Entries: visible to workspace members
CREATE POLICY entries_select ON entries FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL));

CREATE POLICY entries_insert ON entries FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL AND role IN ('owner', 'editor')));

CREATE POLICY entries_update ON entries FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL AND role IN ('owner', 'editor')));

CREATE POLICY entries_delete ON entries FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL AND role = 'owner'));

-- Agent keys: visible to workspace members
CREATE POLICY agent_keys_select ON agent_keys FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL));

CREATE POLICY agent_keys_insert ON agent_keys FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL AND role IN ('owner', 'editor')));

-- Service role bypasses RLS, so our API server (using SUPABASE_SERVICE_ROLE_KEY) can do everything.
-- Agent keys authenticate through our API middleware which uses the service role connection.
