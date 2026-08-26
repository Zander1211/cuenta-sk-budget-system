-- ================================================================
-- Cuenta: Atomic Restore-From-Backup RPC
-- Run this in the Supabase Dashboard SQL Editor
-- ================================================================
-- Restoring a backup previously ran as a series of client-side
-- upsert/delete calls (BackupRestoreContext.applySnapshot), each one
-- subject to per-row RLS. If the caller's cached JWT does not yet
-- carry an up-to-date `role` claim (e.g. right after a role change,
-- before the session token has refreshed), the UPDATE branch of the
-- `documents` upsert fails with "new row violates row-level security
-- policy for table documents" even though the user is really the SK
-- Chairman. `rollback_restored_backup` (20260804130000) already solved
-- this for the delete/rollback path via SECURITY DEFINER; this does
-- the same for the initial restore.

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
  -- 1. Verify authentication and role
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

  -- 2. Clear all operational tables in FK-safe reverse dependency order
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

  -- 3. Insert backup records in FK-safe parent-before-child order
  -- 3.1 Budgets
  IF (v_snapshot->'supabase' ? 'budgets') AND jsonb_array_length(v_snapshot->'supabase'->'budgets') > 0 THEN
    INSERT INTO public.budgets
    SELECT * FROM jsonb_populate_recordset(null::public.budgets, v_snapshot->'supabase'->'budgets');
  END IF;

  -- 3.2 Documents
  IF (v_snapshot->'supabase' ? 'documents') AND jsonb_array_length(v_snapshot->'supabase'->'documents') > 0 THEN
    INSERT INTO public.documents
    SELECT * FROM jsonb_populate_recordset(null::public.documents, v_snapshot->'supabase'->'documents');
  END IF;

  -- 3.3 Document Counters
  IF (v_snapshot->'supabase' ? 'document_counters') AND jsonb_array_length(v_snapshot->'supabase'->'document_counters') > 0 THEN
    INSERT INTO public.document_counters
    SELECT * FROM jsonb_populate_recordset(null::public.document_counters, v_snapshot->'supabase'->'document_counters');
  END IF;

  -- 3.4 Budget Requests
  IF (v_snapshot->'supabase' ? 'budget_requests') AND jsonb_array_length(v_snapshot->'supabase'->'budget_requests') > 0 THEN
    INSERT INTO public.budget_requests
    SELECT * FROM jsonb_populate_recordset(null::public.budget_requests, v_snapshot->'supabase'->'budget_requests');
  END IF;

  -- 3.5 Expenses
  IF (v_snapshot->'supabase' ? 'expenses') AND jsonb_array_length(v_snapshot->'supabase'->'expenses') > 0 THEN
    INSERT INTO public.expenses
    SELECT * FROM jsonb_populate_recordset(null::public.expenses, v_snapshot->'supabase'->'expenses');
  END IF;

  -- 3.6 Receipt Records
  IF (v_snapshot->'supabase' ? 'receipt_records') AND jsonb_array_length(v_snapshot->'supabase'->'receipt_records') > 0 THEN
    INSERT INTO public.receipt_records
    SELECT * FROM jsonb_populate_recordset(null::public.receipt_records, v_snapshot->'supabase'->'receipt_records');
  END IF;

  -- 3.7 Project Photos
  IF (v_snapshot->'supabase' ? 'project_photos') AND jsonb_array_length(v_snapshot->'supabase'->'project_photos') > 0 THEN
    INSERT INTO public.project_photos
    SELECT * FROM jsonb_populate_recordset(null::public.project_photos, v_snapshot->'supabase'->'project_photos');
  END IF;

  -- 3.8 Report Summaries
  IF (v_snapshot->'supabase' ? 'report_summaries') AND jsonb_array_length(v_snapshot->'supabase'->'report_summaries') > 0 THEN
    INSERT INTO public.report_summaries
    SELECT * FROM jsonb_populate_recordset(null::public.report_summaries, v_snapshot->'supabase'->'report_summaries');
  END IF;

  -- 3.9 Notifications
  IF (v_snapshot->'supabase' ? 'notifications') AND jsonb_array_length(v_snapshot->'supabase'->'notifications') > 0 THEN
    INSERT INTO public.notifications
    SELECT * FROM jsonb_populate_recordset(null::public.notifications, v_snapshot->'supabase'->'notifications');
  END IF;

  -- 3.10 Chat History (optional table)
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
