-- ================================================================
-- Cuenta: Audit Trail v2 — Enhanced Tamper-Evident Schema
-- Run this in the Supabase Dashboard SQL Editor
-- ================================================================
-- This migration adds new columns to the existing audit_trail table
-- to support full before/after change tracking, device info, status,
-- and remarks. It also tightens RLS to prevent any DELETE operations.
-- ================================================================

-- 1. ADD NEW COLUMNS (idempotent — safe to run multiple times)
-- ================================================================

ALTER TABLE audit_trail
  ADD COLUMN IF NOT EXISTS action_type   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS record_type   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS record_id     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS previous_value JSONB,
  ADD COLUMN IF NOT EXISTS new_value     JSONB,
  ADD COLUMN IF NOT EXISTS ip_address    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS device_info   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'Success',
  ADD COLUMN IF NOT EXISTS remarks       TEXT NOT NULL DEFAULT '';

-- 2. ADD INDEXES FOR NEW FILTERABLE COLUMNS
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_audit_trail_action_type
  ON audit_trail(action_type);

CREATE INDEX IF NOT EXISTS idx_audit_trail_record_type
  ON audit_trail(record_type);

CREATE INDEX IF NOT EXISTS idx_audit_trail_status
  ON audit_trail(status);

CREATE INDEX IF NOT EXISTS idx_audit_trail_module
  ON audit_trail(module);

-- Composite index for common dashboard query (recent by user)
CREATE INDEX IF NOT EXISTS idx_audit_trail_user_date
  ON audit_trail(user_id, created_at DESC);

-- 3. TIGHTEN RLS — REMOVE ALL DELETE PERMISSIONS
-- ================================================================
-- Audit records must be APPEND-ONLY. We drop any existing DELETE
-- policy to ensure no path in the application can delete audit rows.
-- Only a Supabase service-role key or direct DB access can ever delete rows.

DROP POLICY IF EXISTS "Authenticated users can delete audit trail" ON audit_trail;

-- Re-confirm INSERT and SELECT policies exist (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_trail'
      AND policyname = 'Authenticated users can insert audit trail'
  ) THEN
    CREATE POLICY "Authenticated users can insert audit trail"
      ON audit_trail FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_trail'
      AND policyname = 'Authenticated users can read audit trail'
  ) THEN
    CREATE POLICY "Authenticated users can read audit trail"
      ON audit_trail FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 4. PREVENT UPDATE OPERATIONS (append-only enforcement)
-- ================================================================
-- Drop any UPDATE policy — rows should never be modified after insert.
DROP POLICY IF EXISTS "Authenticated users can update audit trail" ON audit_trail;

-- 5. COMMENT ON TABLE (documentation)
-- ================================================================
COMMENT ON TABLE audit_trail IS
  'Tamper-evident, append-only audit log. '
  'No DELETE or UPDATE policies exist — rows can only be inserted by authenticated users. '
  'Deletion is only possible via Supabase service-role key or direct DB access.';

COMMENT ON COLUMN audit_trail.action_type    IS 'Canonical action type, e.g. "Budget Updated", "User Login"';
COMMENT ON COLUMN audit_trail.record_type    IS 'Entity type affected, e.g. "Budget", "Project", "User"';
COMMENT ON COLUMN audit_trail.record_id      IS 'ID of the affected record (UUID or string)';
COMMENT ON COLUMN audit_trail.previous_value IS 'JSON snapshot of the record BEFORE the change';
COMMENT ON COLUMN audit_trail.new_value      IS 'JSON snapshot of the record AFTER the change';
COMMENT ON COLUMN audit_trail.ip_address     IS 'Client IP address (best-effort from browser)';
COMMENT ON COLUMN audit_trail.device_info    IS 'Parsed browser / device summary string';
COMMENT ON COLUMN audit_trail.status         IS 'Outcome: Success or Failed';
COMMENT ON COLUMN audit_trail.remarks        IS 'Optional reason or notes (e.g. rejection reason)';
