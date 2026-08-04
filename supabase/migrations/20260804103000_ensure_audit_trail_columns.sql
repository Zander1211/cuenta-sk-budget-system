-- The original enhanced audit migration used a non-timestamped filename, so
-- Supabase CLI skipped it on linked deployments. Ensure the atomic approval
-- function has every append-only audit column it writes.

ALTER TABLE public.audit_trail
  ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS record_type TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS record_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS previous_value JSONB,
  ADD COLUMN IF NOT EXISTS new_value JSONB,
  ADD COLUMN IF NOT EXISTS ip_address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS device_info TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Success',
  ADD COLUMN IF NOT EXISTS remarks TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_audit_trail_action_type
  ON public.audit_trail(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_trail_record_type
  ON public.audit_trail(record_type);
CREATE INDEX IF NOT EXISTS idx_audit_trail_status
  ON public.audit_trail(status);
CREATE INDEX IF NOT EXISTS idx_audit_trail_module
  ON public.audit_trail(module);
CREATE INDEX IF NOT EXISTS idx_audit_trail_user_date
  ON public.audit_trail(user_id, created_at DESC);

DROP POLICY IF EXISTS "Authenticated users can delete audit trail"
  ON public.audit_trail;
DROP POLICY IF EXISTS "Authenticated users can update audit trail"
  ON public.audit_trail;

