-- ================================================================
-- Cuenta: Rollback Restored Backup & Snapshot Persistence Migration
-- Run this in the Supabase Dashboard SQL Editor
-- ================================================================

-- ── 1. Add snapshot column to restore_history ───────────────────
-- Persists pre-restore snapshot JSONB in database so rollback works
-- across any device, browser, or deployment (including Vercel).
ALTER TABLE public.restore_history ADD COLUMN IF NOT EXISTS snapshot JSONB;

-- ── 2. Add missing RLS policies on receipt_records ──────────────
DROP POLICY IF EXISTS "SK Chairman and SK Treasurer can delete receipt records" ON public.receipt_records;
CREATE POLICY "SK Chairman and SK Treasurer can delete receipt records"
  ON public.receipt_records FOR DELETE
  TO authenticated
  USING (
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  );

DROP POLICY IF EXISTS "SK Chairman and SK Treasurer can update receipt records" ON public.receipt_records;
CREATE POLICY "SK Chairman and SK Treasurer can update receipt records"
  ON public.receipt_records FOR UPDATE
  TO authenticated
  USING (
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  )
  WITH CHECK (
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  );

-- ── 3. Add DELETE policy on document_counters ───────────────────
DO $policy$
BEGIN
  IF to_regclass('public.document_counters') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated delete" ON public.document_counters';
    EXECUTE 'CREATE POLICY "Allow authenticated delete"
      ON public.document_counters FOR DELETE TO authenticated USING (true)';
  END IF;
END
$policy$;

-- ── 4. Ensure budget_requests allows SK Chairman/Treasurer restore
DROP POLICY IF EXISTS "Authenticated users can insert budget requests" ON public.budget_requests;
CREATE POLICY "Authenticated users can insert budget requests"
  ON public.budget_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by IS NULL 
    OR created_by = auth.uid()
    OR COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  );

-- ── 5. Create atomic rollback_restored_backup RPC function ──────
-- Executes in a single transactional unit with SECURITY DEFINER.
-- Rolls back all operational tables to pre-restore snapshot.
DROP POLICY IF EXISTS "Authenticated users can update budget requests" ON public.budget_requests;
CREATE POLICY "Authenticated users can update budget requests"
  ON public.budget_requests FOR UPDATE
  TO authenticated
  USING (
    created_by IS NULL
    OR created_by = auth.uid()
    OR COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  )
  WITH CHECK (
    created_by IS NULL
    OR created_by = auth.uid()
    OR COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  );

DROP POLICY IF EXISTS "Authenticated users can delete budget requests" ON public.budget_requests;
CREATE POLICY "Authenticated users can delete budget requests"
  ON public.budget_requests FOR DELETE
  TO authenticated
  USING (
    created_by IS NULL
    OR created_by = auth.uid()
    OR COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  );

CREATE OR REPLACE FUNCTION public.rollback_restored_backup(
  p_restore_history_id UUID DEFAULT NULL,
  p_filename TEXT DEFAULT NULL,
  p_snapshot JSONB DEFAULT NULL,
  p_delete_backup BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_snapshot JSONB := p_snapshot;
  v_target_history_id UUID := p_restore_history_id;
  v_filename TEXT := p_filename;
BEGIN
  -- 1. Verify Authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  v_actor_role := COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  );

  IF v_actor_role <> 'SK Chairman' THEN
    RAISE EXCEPTION 'Unauthorized: Only the SK Chairman can rollback restored backups'
      USING ERRCODE = '42501';
  END IF;

  v_actor_name := COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() ->> 'email',
    'SK Chairman'
  );

  -- 2. Retrieve Snapshot if not supplied
  IF v_snapshot IS NULL OR NOT (v_snapshot ? 'supabase') THEN
    IF v_target_history_id IS NOT NULL THEN
      SELECT snapshot, filename INTO v_snapshot, v_filename
      FROM public.restore_history
      WHERE id = v_target_history_id;
    ELSIF v_filename IS NOT NULL THEN
      SELECT id, snapshot INTO v_target_history_id, v_snapshot
      FROM public.restore_history
      WHERE filename = v_filename
      ORDER BY restored_at DESC
      LIMIT 1;
    END IF;
  END IF;

  IF v_snapshot IS NULL OR NOT (v_snapshot ? 'supabase') THEN
    RAISE EXCEPTION 'Pre-restore snapshot not found. Database rollback cannot proceed safely.'
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Clear all operational tables in FK-safe reverse dependency order
  BEGIN
    DELETE FROM public.project_photos;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.report_summaries;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.receipt_records;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.expenses;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.budget_requests;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.document_counters;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.documents;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.budgets;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.notifications;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.chat_history;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- 4. Restore records from snapshot['supabase'] in FK-safe parent-before-child order
  -- 4.1 Budgets
  IF (v_snapshot->'supabase' ? 'budgets') AND jsonb_array_length(v_snapshot->'supabase'->'budgets') > 0 THEN
    INSERT INTO public.budgets
    SELECT * FROM jsonb_populate_recordset(null::public.budgets, v_snapshot->'supabase'->'budgets');
  END IF;

  -- 4.2 Documents
  IF (v_snapshot->'supabase' ? 'documents') AND jsonb_array_length(v_snapshot->'supabase'->'documents') > 0 THEN
    INSERT INTO public.documents
    SELECT * FROM jsonb_populate_recordset(null::public.documents, v_snapshot->'supabase'->'documents');
  END IF;

  -- 4.3 Document Counters
  IF (v_snapshot->'supabase' ? 'document_counters') AND jsonb_array_length(v_snapshot->'supabase'->'document_counters') > 0 THEN
    INSERT INTO public.document_counters
    SELECT * FROM jsonb_populate_recordset(null::public.document_counters, v_snapshot->'supabase'->'document_counters')
    ON CONFLICT (id) DO UPDATE SET last_number = EXCLUDED.last_number, year = EXCLUDED.year;
  END IF;

  -- 4.4 Budget Requests
  IF (v_snapshot->'supabase' ? 'budget_requests') AND jsonb_array_length(v_snapshot->'supabase'->'budget_requests') > 0 THEN
    INSERT INTO public.budget_requests
    SELECT * FROM jsonb_populate_recordset(null::public.budget_requests, v_snapshot->'supabase'->'budget_requests');
  END IF;

  -- 4.5 Expenses
  IF (v_snapshot->'supabase' ? 'expenses') AND jsonb_array_length(v_snapshot->'supabase'->'expenses') > 0 THEN
    INSERT INTO public.expenses
    SELECT * FROM jsonb_populate_recordset(null::public.expenses, v_snapshot->'supabase'->'expenses');
  END IF;

  -- 4.6 Receipt Records
  IF (v_snapshot->'supabase' ? 'receipt_records') AND jsonb_array_length(v_snapshot->'supabase'->'receipt_records') > 0 THEN
    INSERT INTO public.receipt_records
    SELECT * FROM jsonb_populate_recordset(null::public.receipt_records, v_snapshot->'supabase'->'receipt_records');
  END IF;

  -- 4.7 Project Photos
  IF (v_snapshot->'supabase' ? 'project_photos') AND jsonb_array_length(v_snapshot->'supabase'->'project_photos') > 0 THEN
    INSERT INTO public.project_photos
    SELECT * FROM jsonb_populate_recordset(null::public.project_photos, v_snapshot->'supabase'->'project_photos');
  END IF;

  -- 4.8 Report Summaries
  IF (v_snapshot->'supabase' ? 'report_summaries') AND jsonb_array_length(v_snapshot->'supabase'->'report_summaries') > 0 THEN
    INSERT INTO public.report_summaries
    SELECT * FROM jsonb_populate_recordset(null::public.report_summaries, v_snapshot->'supabase'->'report_summaries');
  END IF;

  -- 4.9 Notifications
  IF (v_snapshot->'supabase' ? 'notifications') AND jsonb_array_length(v_snapshot->'supabase'->'notifications') > 0 THEN
    INSERT INTO public.notifications
    SELECT * FROM jsonb_populate_recordset(null::public.notifications, v_snapshot->'supabase'->'notifications');
  END IF;

  -- 4.10 Chat History
  IF (v_snapshot->'supabase' ? 'chat_history') AND jsonb_array_length(v_snapshot->'supabase'->'chat_history') > 0 THEN
    BEGIN
      INSERT INTO public.chat_history
      SELECT * FROM jsonb_populate_recordset(null::public.chat_history, v_snapshot->'supabase'->'chat_history');
    EXCEPTION WHEN undefined_table THEN NULL; END;
  END IF;

  -- 5. Delete Restore History record
  IF v_target_history_id IS NOT NULL THEN
    DELETE FROM public.restore_history WHERE id = v_target_history_id;
  ELSIF v_filename IS NOT NULL THEN
    DELETE FROM public.restore_history WHERE filename = v_filename;
  END IF;

  -- 6. Delete Backup metadata record if requested
  IF p_delete_backup AND v_filename IS NOT NULL THEN
    DELETE FROM public.backups WHERE filename = v_filename;
  END IF;

  -- 7. Record Audit Log for the successful rollback
  INSERT INTO public.audit_trail (
    user_id, user_name, user_role, action, action_type, module,
    record_type, record_id, description, status
  )
  VALUES (
    auth.uid(), v_actor_name, v_actor_role,
    'Restored Backup Deleted — ' || COALESCE(v_filename, 'System Rollback'),
    'Restore Rolled Back', 'Backup & Restore', 'Restore History',
    COALESCE(v_target_history_id::TEXT, v_filename, ''),
    'Deleted restored backup "' || COALESCE(v_filename, '') || '" and automatically reverted database to pre-restore snapshot.',
    'Success'
  );

  RETURN jsonb_build_object(
    'success', true,
    'filename', v_filename,
    'history_id', v_target_history_id,
    'rolled_back', true,
    'localStorage', COALESCE(v_snapshot->'localStorage', '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_restored_backup(UUID, TEXT, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_restored_backup(UUID, TEXT, JSONB, BOOLEAN) TO authenticated;
