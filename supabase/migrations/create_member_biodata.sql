-- ================================================================
-- Cuenta: Member Biodata (personal information on file)
--
-- One row per user, keyed to auth.users.id. Filled in by the member
-- themselves from Profile > Biodata; visible to the SK Chairman from
-- User Management for record-keeping (e.g. a printed personnel file).
-- ================================================================

CREATE TABLE IF NOT EXISTS member_biodata (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  birthdate         DATE,
  sex               TEXT,
  civil_status      TEXT,
  citizenship       TEXT,
  complete_address  TEXT,
  mobile_number     TEXT,
  updated_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE member_biodata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own biodata" ON member_biodata;
CREATE POLICY "Users can view own biodata"
  ON member_biodata FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own biodata" ON member_biodata;
CREATE POLICY "Users can insert own biodata"
  ON member_biodata FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own biodata" ON member_biodata;
CREATE POLICY "Users can update own biodata"
  ON member_biodata FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- SK Chairman can view every member's biodata (read-only — the Chairman
-- doesn't edit someone else's personal information, just views it).
DROP POLICY IF EXISTS "Chairman can view all biodata" ON member_biodata;
CREATE POLICY "Chairman can view all biodata"
  ON member_biodata FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'SK Chairman');

-- ----------------------------------------------------------------
-- Fix pre-existing drift: created_accounts is missing is_active,
-- which UserManagementPage's Deactivate/Reactivate feature needs.
-- Additive only — safe on a live table.
-- ----------------------------------------------------------------
ALTER TABLE created_accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
