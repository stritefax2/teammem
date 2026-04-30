-- Allow 'member' as a workspace role.
--
-- The original schema (001_initial.sql, 004_workspace_invites.sql) only
-- accepted owner/editor/viewer. The UI now offers Member / Owner since
-- editor and viewer were enforced identically (only owner gates anything,
-- workspace deletion). 'member' is the canonical name going forward;
-- 'editor' and 'viewer' stay accepted as aliases for older rows and
-- pending invites that already used them.

-- 1. Drop existing CHECK constraints on the role column.
ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE workspace_invites DROP CONSTRAINT IF EXISTS workspace_invites_role_check;

-- 2. Recreate with 'member' included.
ALTER TABLE workspace_members
  ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('owner', 'member', 'editor', 'viewer'));

ALTER TABLE workspace_invites
  ADD CONSTRAINT workspace_invites_role_check
  CHECK (role IN ('owner', 'member', 'editor', 'viewer'));

-- 3. Update RLS policies that gated writes on role = 'editor' to also
--    allow role = 'member'. Without this, any new member-role user
--    would be silently blocked from writing collections/entries despite
--    the API allowing it.
DROP POLICY IF EXISTS collections_write ON collections;
CREATE POLICY collections_write ON collections FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND role IN ('owner', 'member', 'editor')
  ));

DROP POLICY IF EXISTS entries_write ON entries;
CREATE POLICY entries_write ON entries FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND role IN ('owner', 'member', 'editor')
  ));
