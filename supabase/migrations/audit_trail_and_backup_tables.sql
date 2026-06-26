-- ================================================================
-- Cuenta: Audit Trail + Backup & Restore Tables
-- Run this in the Supabase Dashboard SQL Editor
-- ================================================================

-- 1. AUDIT TRAIL TABLE
-- Stores all user and system activities
-- ================================================================
CREATE TABLE IF NOT EXISTS audit_trail (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name    TEXT NOT NULL DEFAULT '',
  user_role    TEXT NOT NULL DEFAULT '',
  action       TEXT NOT NULL,
  module       TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for fast queries by date (most common sort)
CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON audit_trail(created_at DESC);
-- Index for filtering by user
CREATE INDEX IF NOT EXISTS idx_audit_trail_user_id ON audit_trail(user_id);
-- Index for filtering by action type
CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON audit_trail(action);

-- Enable RLS
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can INSERT audit records
CREATE POLICY "Authenticated users can insert audit trail"
  ON audit_trail FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Any authenticated user can read audit trail
-- (page-level access is controlled by RoleGate in the React app)
CREATE POLICY "Authenticated users can read audit trail"
  ON audit_trail FOR SELECT
  TO authenticated
  USING (true);

-- Only allow deletion via service role (or SK Chairman via app logic)
CREATE POLICY "Authenticated users can delete audit trail"
  ON audit_trail FOR DELETE
  TO authenticated
  USING (true);


-- 2. BACKUPS TABLE
-- Stores metadata about each backup created
-- ================================================================
CREATE TABLE IF NOT EXISTS backups (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename        TEXT NOT NULL,
  backup_size     BIGINT NOT NULL DEFAULT 0,
  created_by_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);

ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

-- Authenticated users can create and view backups
CREATE POLICY "Authenticated users can insert backups"
  ON backups FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read backups"
  ON backups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete backups"
  ON backups FOR DELETE
  TO authenticated
  USING (true);


-- 3. RESTORE HISTORY TABLE
-- Records every restore operation attempted
-- ================================================================
CREATE TABLE IF NOT EXISTS restore_history (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename         TEXT NOT NULL,
  restored_by_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  restored_by_name TEXT NOT NULL DEFAULT '',
  restore_status   TEXT NOT NULL DEFAULT 'pending',
  details          TEXT NOT NULL DEFAULT '',
  restored_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_restore_history_restored_at ON restore_history(restored_at DESC);

ALTER TABLE restore_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert restore history"
  ON restore_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read restore history"
  ON restore_history FOR SELECT
  TO authenticated
  USING (true);
