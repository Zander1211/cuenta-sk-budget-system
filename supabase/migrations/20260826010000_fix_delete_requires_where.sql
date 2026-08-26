-- ================================================================
-- Cuenta: Fix "DELETE requires a WHERE clause" in restore/rollback RPCs
-- Run this in the Supabase Dashboard SQL Editor
-- ================================================================
-- This project's Postgres instance rejects unqualified DELETE
-- statements (e.g. via pg_safeupdate or an equivalent guard), even
-- inside a SECURITY DEFINER function body. `restore_backup_atomic`
-- (20260826000000) and `rollback_restored_backup` (20260804130000)
-- both clear operational tables with bare `DELETE FROM public.<table>;`
-- statements, which trip that guard and abort the whole transaction.
-- Adding a no-op `WHERE true` satisfies the guard without changing
-- behavior — every row is still deleted.

CREATE OR REPLACE FUNCTION public.restore_backup_atomic(
  p_backup_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_role TEXT;
  v_snapshot JSONB := p_backup_data;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  v_actor_role := COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  );

  IF v_actor_role <> 'SK Chairman' THEN
    RAISE EXCEPTION 'Unauthorized: Only the SK Chairman can restore backups'
      USING ERRCODE = '42501';
  END IF;

  IF v_snapshot IS NULL OR NOT (v_snapshot ? 'supabase') THEN
    RAISE EXCEPTION 'Backup payload is missing or malformed.'
      USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    DELETE FROM public.project_photos WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.report_summaries WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.receipt_records WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.expenses WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.budget_requests WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.document_counters WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.documents WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.budgets WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.notifications WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.chat_history WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  IF (v_snapshot->'supabase' ? 'budgets') AND jsonb_array_length(v_snapshot->'supabase'->'budgets') > 0 THEN
    INSERT INTO public.budgets
    SELECT * FROM jsonb_populate_recordset(null::public.budgets, v_snapshot->'supabase'->'budgets');
  END IF;

  IF (v_snapshot->'supabase' ? 'documents') AND jsonb_array_length(v_snapshot->'supabase'->'documents') > 0 THEN
    INSERT INTO public.documents
    SELECT * FROM jsonb_populate_recordset(null::public.documents, v_snapshot->'supabase'->'documents');
  END IF;

  IF (v_snapshot->'supabase' ? 'document_counters') AND jsonb_array_length(v_snapshot->'supabase'->'document_counters') > 0 THEN
    INSERT INTO public.document_counters
    SELECT * FROM jsonb_populate_recordset(null::public.document_counters, v_snapshot->'supabase'->'document_counters');
  END IF;

  IF (v_snapshot->'supabase' ? 'budget_requests') AND jsonb_array_length(v_snapshot->'supabase'->'budget_requests') > 0 THEN
    INSERT INTO public.budget_requests
    SELECT * FROM jsonb_populate_recordset(null::public.budget_requests, v_snapshot->'supabase'->'budget_requests');
  END IF;

  IF (v_snapshot->'supabase' ? 'expenses') AND jsonb_array_length(v_snapshot->'supabase'->'expenses') > 0 THEN
    INSERT INTO public.expenses
    SELECT * FROM jsonb_populate_recordset(null::public.expenses, v_snapshot->'supabase'->'expenses');
  END IF;

  IF (v_snapshot->'supabase' ? 'receipt_records') AND jsonb_array_length(v_snapshot->'supabase'->'receipt_records') > 0 THEN
    INSERT INTO public.receipt_records
    SELECT * FROM jsonb_populate_recordset(null::public.receipt_records, v_snapshot->'supabase'->'receipt_records');
  END IF;

  IF (v_snapshot->'supabase' ? 'project_photos') AND jsonb_array_length(v_snapshot->'supabase'->'project_photos') > 0 THEN
    INSERT INTO public.project_photos
    SELECT * FROM jsonb_populate_recordset(null::public.project_photos, v_snapshot->'supabase'->'project_photos');
  END IF;

  IF (v_snapshot->'supabase' ? 'report_summaries') AND jsonb_array_length(v_snapshot->'supabase'->'report_summaries') > 0 THEN
    INSERT INTO public.report_summaries
    SELECT * FROM jsonb_populate_recordset(null::public.report_summaries, v_snapshot->'supabase'->'report_summaries');
  END IF;

  IF (v_snapshot->'supabase' ? 'notifications') AND jsonb_array_length(v_snapshot->'supabase'->'notifications') > 0 THEN
    INSERT INTO public.notifications
    SELECT * FROM jsonb_populate_recordset(null::public.notifications, v_snapshot->'supabase'->'notifications');
  END IF;

  IF (v_snapshot->'supabase' ? 'chat_history') AND jsonb_array_length(v_snapshot->'supabase'->'chat_history') > 0 THEN
    BEGIN
      INSERT INTO public.chat_history
      SELECT * FROM jsonb_populate_recordset(null::public.chat_history, v_snapshot->'supabase'->'chat_history');
    EXCEPTION WHEN undefined_table THEN NULL; END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'localStorage', COALESCE(v_snapshot->'localStorage', '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_backup_atomic(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_backup_atomic(JSONB) TO authenticated;

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

  BEGIN
    DELETE FROM public.project_photos WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.report_summaries WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.receipt_records WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.expenses WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.budget_requests WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.document_counters WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.documents WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.budgets WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.notifications WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DELETE FROM public.chat_history WHERE true;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  IF (v_snapshot->'supabase' ? 'budgets') AND jsonb_array_length(v_snapshot->'supabase'->'budgets') > 0 THEN
    INSERT INTO public.budgets
    SELECT * FROM jsonb_populate_recordset(null::public.budgets, v_snapshot->'supabase'->'budgets');
  END IF;

  IF (v_snapshot->'supabase' ? 'documents') AND jsonb_array_length(v_snapshot->'supabase'->'documents') > 0 THEN
    INSERT INTO public.documents
    SELECT * FROM jsonb_populate_recordset(null::public.documents, v_snapshot->'supabase'->'documents');
  END IF;

  IF (v_snapshot->'supabase' ? 'document_counters') AND jsonb_array_length(v_snapshot->'supabase'->'document_counters') > 0 THEN
    INSERT INTO public.document_counters
    SELECT * FROM jsonb_populate_recordset(null::public.document_counters, v_snapshot->'supabase'->'document_counters')
    ON CONFLICT (id) DO UPDATE SET last_number = EXCLUDED.last_number, year = EXCLUDED.year;
  END IF;

  IF (v_snapshot->'supabase' ? 'budget_requests') AND jsonb_array_length(v_snapshot->'supabase'->'budget_requests') > 0 THEN
    INSERT INTO public.budget_requests
    SELECT * FROM jsonb_populate_recordset(null::public.budget_requests, v_snapshot->'supabase'->'budget_requests');
  END IF;

  IF (v_snapshot->'supabase' ? 'expenses') AND jsonb_array_length(v_snapshot->'supabase'->'expenses') > 0 THEN
    INSERT INTO public.expenses
    SELECT * FROM jsonb_populate_recordset(null::public.expenses, v_snapshot->'supabase'->'expenses');
  END IF;

  IF (v_snapshot->'supabase' ? 'receipt_records') AND jsonb_array_length(v_snapshot->'supabase'->'receipt_records') > 0 THEN
    INSERT INTO public.receipt_records
    SELECT * FROM jsonb_populate_recordset(null::public.receipt_records, v_snapshot->'supabase'->'receipt_records');
  END IF;

  IF (v_snapshot->'supabase' ? 'project_photos') AND jsonb_array_length(v_snapshot->'supabase'->'project_photos') > 0 THEN
    INSERT INTO public.project_photos
    SELECT * FROM jsonb_populate_recordset(null::public.project_photos, v_snapshot->'supabase'->'project_photos');
  END IF;

  IF (v_snapshot->'supabase' ? 'report_summaries') AND jsonb_array_length(v_snapshot->'supabase'->'report_summaries') > 0 THEN
    INSERT INTO public.report_summaries
    SELECT * FROM jsonb_populate_recordset(null::public.report_summaries, v_snapshot->'supabase'->'report_summaries');
  END IF;

  IF (v_snapshot->'supabase' ? 'notifications') AND jsonb_array_length(v_snapshot->'supabase'->'notifications') > 0 THEN
    INSERT INTO public.notifications
    SELECT * FROM jsonb_populate_recordset(null::public.notifications, v_snapshot->'supabase'->'notifications');
  END IF;

  IF (v_snapshot->'supabase' ? 'chat_history') AND jsonb_array_length(v_snapshot->'supabase'->'chat_history') > 0 THEN
    BEGIN
      INSERT INTO public.chat_history
      SELECT * FROM jsonb_populate_recordset(null::public.chat_history, v_snapshot->'supabase'->'chat_history');
    EXCEPTION WHEN undefined_table THEN NULL; END;
  END IF;

  IF v_target_history_id IS NOT NULL THEN
    DELETE FROM public.restore_history WHERE id = v_target_history_id;
  ELSIF v_filename IS NOT NULL THEN
    DELETE FROM public.restore_history WHERE filename = v_filename;
  END IF;

  IF p_delete_backup AND v_filename IS NOT NULL THEN
    DELETE FROM public.backups WHERE filename = v_filename;
  END IF;

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
