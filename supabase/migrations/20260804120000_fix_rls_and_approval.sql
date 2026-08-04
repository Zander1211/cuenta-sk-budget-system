-- ================================================================
-- Cuenta: Fix missing RLS policies and ensure approval RPC works
-- Run this in the Supabase Dashboard SQL Editor
-- ================================================================

-- ── 1. notifications: add INSERT/UPDATE/DELETE policies ─────────
-- The approval flow and backup/restore both need to write notifications.

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update notifications" ON public.notifications;
CREATE POLICY "Authenticated users can update notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete notifications" ON public.notifications;
CREATE POLICY "Authenticated users can delete notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (true);

-- ── 2. restore_history: add DELETE policy ───────────────────────
-- Needed for backup deletion with rollback.

DROP POLICY IF EXISTS "Authenticated users can delete restore history" ON public.restore_history;
CREATE POLICY "Authenticated users can delete restore history"
  ON public.restore_history FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can update restore history" ON public.restore_history;
CREATE POLICY "Authenticated users can update restore history"
  ON public.restore_history FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- ── 3. expenses: ensure full CRUD policies exist ────────────────
-- The atomic_budget_approval migration recreated only the SELECT policy.
-- The fix_schema_drift migration added INSERT/UPDATE/DELETE but may have
-- run in a different order on the deployed instance. Be safe and ensure
-- all four policies exist.

DROP POLICY IF EXISTS "Authenticated users can insert expenses" ON public.expenses;
CREATE POLICY "Authenticated users can insert expenses"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update expenses" ON public.expenses;
CREATE POLICY "Authenticated users can update expenses"
  ON public.expenses FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete expenses" ON public.expenses;
CREATE POLICY "Authenticated users can delete expenses"
  ON public.expenses FOR DELETE TO authenticated
  USING (true);

-- ── 4. documents: fix DELETE policy to use both JWT paths ───────
-- The original policy only checks user_metadata, but deployed accounts
-- may store the role in app_metadata.

DROP POLICY IF EXISTS "Allow SK Chairman and Treasurer to delete documents" ON public.documents;
CREATE POLICY "Allow SK Chairman and Treasurer to delete documents"
  ON public.documents FOR DELETE TO authenticated
  USING (
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  );

DROP POLICY IF EXISTS "Allow SK Chairman and Treasurer to update documents" ON public.documents;
CREATE POLICY "Allow SK Chairman and Treasurer to update documents"
  ON public.documents FOR UPDATE TO authenticated
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

-- ── 5. Ensure audit_trail INSERT policy exists ──────────────────
-- The approval fallback inserts directly into audit_trail.

DROP POLICY IF EXISTS "Authenticated users can insert audit trail" ON public.audit_trail;
CREATE POLICY "Authenticated users can insert audit trail"
  ON public.audit_trail FOR INSERT TO authenticated
  WITH CHECK (true);

-- ── 6. Re-deploy the approve_budget_request RPC function ────────
-- This is the SECURITY DEFINER function that performs the atomic approval.
-- If this was not deployed, the RPC call returns 403 and the fallback runs.

CREATE OR REPLACE FUNCTION public.approve_budget_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_request public.budget_requests%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_notification public.notifications%ROWTYPE;
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
    requested_by, created_by, project_status, updated_at, created_at, is_additional
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
    v_request.requested_by, v_request.created_by, 'Ongoing', v_approved_at, v_approved_at, false
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
      updated_at = v_approved_at,
      is_additional = false
  RETURNING * INTO v_expense;

  IF NOT v_was_approved THEN
    INSERT INTO public.audit_trail (
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
    VALUES (
      'approval', 'Budget Request Approved',
      v_request.type || ': ' || v_request.event
        || E'\nApproved: ₱'
        || to_char(COALESCE(v_request.approved_amount, v_request.amount, 0), 'FM999,999,999,990.00'),
      auth.uid(), v_actor_role, 'SK Treasurer', v_request.id
    )
    RETURNING * INTO v_notification;
  END IF;

  RETURN jsonb_build_object(
    'request', to_jsonb(v_request),
    'expense', to_jsonb(v_expense),
    'notification', CASE
      WHEN v_notification.id IS NULL THEN NULL
      ELSE to_jsonb(v_notification)
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_budget_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_budget_request(UUID) TO authenticated;
