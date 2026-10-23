-- 20261023150000_update_audit_trail_to_activity_logs.sql
-- Migration to support 'activity_logs' as the primary activity log table.
-- 1. Safely ensure table 'activity_logs' exists (renaming from audit_trail if not already done)
-- 2. Configure indexes and Row-Level Security (RLS) on public.activity_logs
-- 3. Create a backward-compatible updatable view for 'audit_trail'
-- 4. Update stored procedures to insert directly into public.activity_logs

-- ── 1. RENAME TABLE IF NEEDED ──────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'audit_trail'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'activity_logs'
  ) THEN
    ALTER TABLE public.audit_trail RENAME TO activity_logs;
  END IF;
END $$;

-- ── 2. ENSURE INDEXES ON activity_logs ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON public.activity_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type
  ON public.activity_logs(action_type);

CREATE INDEX IF NOT EXISTS idx_activity_logs_record_type
  ON public.activity_logs(record_type);

CREATE INDEX IF NOT EXISTS idx_activity_logs_status
  ON public.activity_logs(status);

CREATE INDEX IF NOT EXISTS idx_activity_logs_module
  ON public.activity_logs(module);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date
  ON public.activity_logs(user_id, created_at DESC);

-- ── 3. ROW LEVEL SECURITY ON activity_logs ────────────────────────────────
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'activity_logs'
      AND policyname = 'Authenticated users can insert activity logs'
  ) THEN
    CREATE POLICY "Authenticated users can insert activity logs"
      ON public.activity_logs FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'activity_logs'
      AND policyname = 'Authenticated users can read activity logs'
  ) THEN
    CREATE POLICY "Authenticated users can read activity logs"
      ON public.activity_logs FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Ensure audit/activity records remain append-only through the API
DROP POLICY IF EXISTS "Authenticated users can update activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Authenticated users can delete activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Authenticated users can update audit trail" ON public.activity_logs;
DROP POLICY IF EXISTS "Authenticated users can delete audit trail" ON public.activity_logs;

GRANT SELECT, INSERT ON public.activity_logs TO authenticated, anon;
GRANT ALL ON public.activity_logs TO service_role;

-- ── 4. BACKWARD COMPATIBLE VIEW 'audit_trail' ─────────────────────────────
-- Simple views in Postgres 9.3+ are automatically updatable.
-- Any code, backup, or trigger still referring to public.audit_trail will seamlessly map to activity_logs.
CREATE OR REPLACE VIEW public.audit_trail WITH (security_invoker = true) AS
  SELECT * FROM public.activity_logs;

GRANT SELECT, INSERT ON public.audit_trail TO authenticated, anon;
GRANT ALL ON public.audit_trail TO service_role;

-- ── 5. UPDATE STORED PROCEDURES TO USE activity_logs ──────────────────────

-- 5a. approve_budget_request
CREATE OR REPLACE FUNCTION public.approve_budget_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_request public.budget_requests%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_approved_at TIMESTAMPTZ := now();
  v_effective_date DATE;
  v_was_approved BOOLEAN;
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
    RAISE EXCEPTION 'Only the SK Chairman can approve budget requests'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_request
  FROM public.budget_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget request % was not found', p_request_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status NOT IN ('Pending', 'Approved') THEN
    RAISE EXCEPTION 'Only pending requests can be approved (current status: %)',
      v_request.status USING ERRCODE = 'P0001';
  END IF;

  IF v_request.type NOT IN ('Project', 'Event', 'Payroll') THEN
    RAISE EXCEPTION 'Unsupported budget request type: %', v_request.type
      USING ERRCODE = '22023';
  END IF;

  v_was_approved := v_request.status = 'Approved';
  v_effective_date := COALESCE(v_request.event_date, v_approved_at::date);
  v_actor_name := COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() ->> 'email',
    'SK Chairman'
  );

  UPDATE public.budget_requests
  SET status = 'Approved',
      project_status = 'Ongoing',
      approved_amount = COALESCE(approved_amount, amount),
      approved_at = COALESCE(approved_at, v_approved_at),
      rejected_at = NULL,
      rejection_reason = NULL,
      updated_at = v_approved_at
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  INSERT INTO public.expenses (
    request_id, event, project, category, type, amount,
    requested_budget, approved_budget, status, approved_at, date, event_date,
    month, year, venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, project_status, updated_at
  )
  VALUES (
    v_request.id, v_request.event, v_request.event,
    v_request.category, v_request.type,
    COALESCE(v_request.approved_amount, v_request.amount, 0),
    COALESCE(v_request.amount, 0),
    COALESCE(v_request.approved_amount, v_request.amount, 0),
    'Approved', v_request.approved_at, v_effective_date, v_request.event_date,
    EXTRACT(MONTH FROM v_effective_date)::INTEGER,
    EXTRACT(YEAR FROM v_effective_date)::INTEGER,
    v_request.venue, v_request.description, v_request.notes,
    COALESCE(v_request.breakdown, '[]'::jsonb),
    COALESCE(v_request.expenses_breakdown, '[]'::jsonb),
    v_request.requested_by, v_request.created_by, 'Ongoing', v_approved_at
  )
  ON CONFLICT (request_id) WHERE request_id IS NOT NULL DO UPDATE
  SET event = EXCLUDED.event,
      project = EXCLUDED.project,
      category = EXCLUDED.category,
      type = EXCLUDED.type,
      amount = EXCLUDED.amount,
      requested_budget = EXCLUDED.requested_budget,
      approved_budget = EXCLUDED.approved_budget,
      status = 'Approved',
      approved_at = EXCLUDED.approved_at,
      date = EXCLUDED.date,
      event_date = EXCLUDED.event_date,
      month = EXCLUDED.month,
      year = EXCLUDED.year,
      venue = EXCLUDED.venue,
      description = EXCLUDED.description,
      notes = EXCLUDED.notes,
      breakdown = EXCLUDED.breakdown,
      expenses_breakdown = EXCLUDED.expenses_breakdown,
      requested_by = EXCLUDED.requested_by,
      created_by = EXCLUDED.created_by,
      project_status = 'Ongoing',
      archived_at = NULL,
      updated_at = v_approved_at
  RETURNING * INTO v_expense;

  IF NOT v_was_approved THEN
    INSERT INTO public.activity_logs (
      user_id, user_name, user_role, action, action_type, module,
      record_type, record_id, description, previous_value, new_value, status
    )
    VALUES (
      auth.uid(), v_actor_name, v_actor_role,
      'Request Approved — ' || v_request.event,
      'Request Approved', 'Budget Requests', 'Budget Request',
      v_request.id::TEXT,
      'Approved budget request for ' || v_request.event,
      jsonb_build_object('status', 'Pending', 'projectStatus', 'Pending'),
      jsonb_build_object(
        'status', 'Approved',
        'projectStatus', 'Ongoing',
        'type', v_request.type,
        'approvedBudget', COALESCE(v_request.approved_amount, v_request.amount, 0)
      ),
      'Success'
    );

    INSERT INTO public.notifications (
      type, title, message, actor_id, actor_role, recipient_role, request_id
    )
    VALUES 
      (
        'approval', 'Budget Request Approved',
        v_request.type || ': ' || v_request.event
          || E'\nApproved: ₱'
          || to_char(COALESCE(v_request.approved_amount, v_request.amount, 0), 'FM999,999,999,990.00'),
        auth.uid(), v_actor_role, 'SK Treasurer', v_request.id
      ),
      (
        'approval', 'Budget Request Approved',
        v_request.type || ': ' || v_request.event
          || E'\nApproved: ₱'
          || to_char(COALESCE(v_request.approved_amount, v_request.amount, 0), 'FM999,999,999,990.00'),
        auth.uid(), v_actor_role, 'SK Kagawad', v_request.id
      ),
      (
        'approval', 'Budget Request Approved',
        v_request.type || ': ' || v_request.event
          || E'\nApproved: ₱'
          || to_char(COALESCE(v_request.approved_amount, v_request.amount, 0), 'FM999,999,999,990.00'),
        auth.uid(), v_actor_role, 'Barangay Treasurer', v_request.id
      );
  END IF;

  RETURN jsonb_build_object(
    'request', to_jsonb(v_request),
    'expense', to_jsonb(v_expense)
  );
END;
$$;

-- 5b. complete_project_event
CREATE OR REPLACE FUNCTION public.complete_project_event(
  p_expense_id BIGINT,
  p_actual_used NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_expense public.expenses%ROWTYPE;
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_now TIMESTAMPTZ := now();
  v_original NUMERIC;
  v_actual NUMERIC;
  v_returned NUMERIC;
  v_month_label TEXT;
  v_title TEXT;
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
    RAISE EXCEPTION 'Only the SK Chairman can mark a Project or Event as Completed'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_expense
  FROM public.expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense record % was not found', p_expense_id
      USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_expense.is_additional, false) THEN
    RAISE EXCEPTION 'Requisition rows cannot be completed directly'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_expense.type, 'Project') NOT IN ('Project', 'Event') THEN
    RAISE EXCEPTION 'Only Projects and Events return unused budget on completion'
      USING ERRCODE = '22023';
  END IF;

  IF v_expense.project_status = 'Completed' AND v_expense.returned_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'expense', to_jsonb(v_expense),
      'returned_budget', COALESCE(v_expense.returned_budget, 0),
      'already_completed', true
    );
  END IF;

  v_original := COALESCE(
    v_expense.original_approved_budget,
    v_expense.approved_budget,
    v_expense.amount,
    0
  );
  v_actual := LEAST(GREATEST(COALESCE(p_actual_used, 0), 0), v_original);
  v_returned := v_original - v_actual;

  v_actor_name := COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() ->> 'email',
    'SK Chairman'
  );
  v_title := COALESCE(v_expense.event, v_expense.project, 'Untitled');
  v_month_label := CASE
    WHEN v_expense.month BETWEEN 1 AND 12 AND v_expense.year IS NOT NULL
      THEN trim(to_char(make_date(v_expense.year, v_expense.month, 1), 'FMMonth YYYY'))
    ELSE 'its original month'
  END;

  UPDATE public.expenses
  SET project_status = 'Completed',
      original_approved_budget = v_original,
      approved_budget = v_actual,
      amount = v_actual,
      returned_budget = v_returned,
      returned_at = v_now,
      updated_at = v_now
  WHERE id = p_expense_id
  RETURNING * INTO v_expense;

  IF v_expense.request_id IS NOT NULL THEN
    UPDATE public.budget_requests
    SET project_status = 'Completed',
        approved_amount = CASE WHEN v_returned > 0 THEN v_actual ELSE approved_amount END,
        updated_at = v_now
    WHERE id = v_expense.request_id;
  END IF;

  IF v_returned > 0 THEN
    INSERT INTO public.activity_logs (
      user_id, user_name, user_role, action, action_type, module,
      record_type, record_id, description, previous_value, new_value, status
    )
    VALUES (
      auth.uid(), v_actor_name, v_actor_role,
      'Returned Unused Budget — ' || v_title,
      'Returned Unused Budget',
      CASE WHEN COALESCE(v_expense.type, 'Project') = 'Event' THEN 'Events' ELSE 'Projects' END,
      COALESCE(v_expense.type, 'Project'),
      v_expense.id::TEXT,
      'Returned ₱' || to_char(v_returned, 'FM999,999,999,990.00')
        || ' of unused budget to ' || v_month_label
        || ' after completing "' || v_title || '"'
        || ' (approved ₱' || to_char(v_original, 'FM999,999,999,990.00')
        || ', actually used ₱' || to_char(v_actual, 'FM999,999,999,990.00') || ').',
      jsonb_build_object(
        'projectStatus', 'Ongoing',
        'approvedBudget', v_original
      ),
      jsonb_build_object(
        'projectStatus', 'Completed',
        'originalApprovedBudget', v_original,
        'actualUsed', v_actual,
        'returnedBudget', v_returned,
        'returnedToMonth', v_month_label,
        'returnedAt', v_now
      ),
      'Success'
    );

    INSERT INTO public.notifications (
      type, title, message, actor_id, actor_role, recipient_role, request_id
    )
    SELECT
      'system', 'Unused Budget Returned',
      '₱' || to_char(v_returned, 'FM999,999,999,990.00')
        || ' has been returned to the ' || v_month_label
        || ' budget after completing "' || v_title || '".',
      auth.uid(), v_actor_role, r.role, v_expense.request_id
    FROM (VALUES ('SK Treasurer'), ('SK Kagawad'), ('Barangay Treasurer')) AS r(role);
  END IF;

  RETURN jsonb_build_object(
    'expense', to_jsonb(v_expense),
    'returned_budget', v_returned,
    'actual_used', v_actual,
    'original_approved_budget', v_original,
    'month_label', v_month_label,
    'already_completed', false
  );
END;
$$;

-- 5c. reopen_project_event
CREATE OR REPLACE FUNCTION public.reopen_project_event(
  p_expense_id BIGINT,
  p_new_status TEXT DEFAULT 'Ongoing'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_expense public.expenses%ROWTYPE;
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_now TIMESTAMPTZ := now();
  v_restored NUMERIC;
  v_title TEXT;
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
    RAISE EXCEPTION 'Only the SK Chairman can reopen a Project or Event'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_status NOT IN ('Pending', 'Ongoing') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_expense
  FROM public.expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense record % was not found', p_expense_id
      USING ERRCODE = 'P0002';
  END IF;

  v_restored := COALESCE(v_expense.returned_budget, 0);
  v_title := COALESCE(v_expense.event, v_expense.project, 'Untitled');
  v_actor_name := COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() ->> 'email',
    'SK Chairman'
  );

  UPDATE public.expenses
  SET project_status = p_new_status,
      approved_budget = COALESCE(original_approved_budget, approved_budget),
      amount = amount + v_restored,
      returned_budget = 0,
      returned_at = NULL,
      original_approved_budget = NULL,
      updated_at = v_now
  WHERE id = p_expense_id
  RETURNING * INTO v_expense;

  IF v_expense.request_id IS NOT NULL THEN
    UPDATE public.budget_requests
    SET project_status = p_new_status,
        approved_amount = COALESCE(approved_amount, 0) + v_restored,
        updated_at = v_now
    WHERE id = v_expense.request_id;
  END IF;

  IF v_restored > 0 THEN
    INSERT INTO public.activity_logs (
      user_id, user_name, user_role, action, action_type, module,
      record_type, record_id, description, previous_value, new_value, status
    )
    VALUES (
      auth.uid(), v_actor_name, v_actor_role,
      'Returned Budget Reversed — ' || v_title,
      'Returned Budget Reversed',
      CASE WHEN COALESCE(v_expense.type, 'Project') = 'Event' THEN 'Events' ELSE 'Projects' END,
      COALESCE(v_expense.type, 'Project'),
      v_expense.id::TEXT,
      'Re-committed ₱' || to_char(v_restored, 'FM999,999,999,990.00')
        || ' to "' || v_title || '" after reopening it as ' || p_new_status || '.',
      jsonb_build_object('projectStatus', 'Completed', 'returnedBudget', v_restored),
      jsonb_build_object('projectStatus', p_new_status, 'returnedBudget', 0),
      'Success'
    );
  END IF;

  RETURN jsonb_build_object(
    'expense', to_jsonb(v_expense),
    'restored_budget', v_restored
  );
END;
$$;

-- 5d. rollback_restored_backup
CREATE OR REPLACE FUNCTION public.rollback_restored_backup(
  p_history_id UUID DEFAULT NULL,
  p_filename TEXT DEFAULT NULL,
  p_snapshot JSONB DEFAULT NULL,
  p_delete_backup BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_snapshot JSONB;
  v_target_history_id UUID;
  v_filename TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  v_actor_role := COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  );

  IF v_actor_role <> 'SK Chairman' THEN
    RAISE EXCEPTION 'Access denied: Only the SK Chairman can roll back a restored backup.'
      USING ERRCODE = '42501';
  END IF;

  v_actor_name := COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() ->> 'email',
    'SK Chairman'
  );

  IF p_snapshot IS NOT NULL AND (p_snapshot ? 'supabase' OR p_snapshot ? 'localStorage') THEN
    v_snapshot := p_snapshot;
    v_target_history_id := p_history_id;
    v_filename := p_filename;
  ELSIF p_history_id IS NOT NULL THEN
    SELECT id, filename, snapshot INTO v_target_history_id, v_filename, v_snapshot
    FROM public.restore_history
    WHERE id = p_history_id;
  ELSIF p_filename IS NOT NULL THEN
    SELECT id, filename, snapshot INTO v_target_history_id, v_filename, v_snapshot
    FROM public.restore_history
    WHERE filename = p_filename
    ORDER BY restored_at DESC
    LIMIT 1;
  END IF;

  IF v_snapshot IS NULL OR NOT (v_snapshot ? 'supabase') THEN
    RAISE EXCEPTION 'Could not resolve a valid pre-restore snapshot to roll back to.'
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.project_photos WHERE true;
  DELETE FROM public.report_summaries WHERE true;
  DELETE FROM public.receipt_records WHERE true;
  DELETE FROM public.expenses WHERE true;
  DELETE FROM public.budget_requests WHERE true;
  DELETE FROM public.document_counters WHERE true;
  DELETE FROM public.documents WHERE true;
  DELETE FROM public.budgets WHERE true;
  DELETE FROM public.notifications WHERE true;

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

  INSERT INTO public.activity_logs (
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
GRANT EXECUTE ON FUNCTION public.complete_project_event(BIGINT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_project_event(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_budget_request(UUID) TO authenticated;
