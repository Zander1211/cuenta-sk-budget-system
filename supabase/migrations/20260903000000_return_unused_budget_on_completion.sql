-- 20260903000000_return_unused_budget_on_completion.sql
-- When the SK Chairman marks a Project or Event as Completed, any unused
-- portion of its approved budget is returned to the month it came from.
--
-- Mechanism: the completed expense row's approved_budget/amount are reduced
-- to the amount actually used, and the linked budget_request's
-- approved_amount is reduced the same way. Every existing summary (dashboard
-- totals, analysis pages, the DB-side monthly capacity trigger that guards
-- new requests) already sums those columns, so the freed money becomes
-- available everywhere with no further changes. The original figure is
-- preserved in original_approved_budget for the Returned Budget History.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS returned_budget NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_approved_budget NUMERIC;

-- ---------------------------------------------------------------------------
-- complete_project_event: mark a Project/Event Completed and return the
-- unused budget. p_actual_used is computed client-side by the same
-- calculateProjectEventFinancials the UI displays (verified receipts plus
-- recorded requisitions), so the returned figure always matches what the
-- Chairman sees on screen; the function clamps it defensively.
-- ---------------------------------------------------------------------------
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

  -- Idempotent: completing an already-completed record changes nothing and
  -- never creates a duplicate return transaction.
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
  v_returned := v_original - v_actual; -- >= 0 by construction

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

  -- The monthly capacity trigger for NEW requests counts committed money from
  -- budget_requests.approved_amount, so the linked request must reflect the
  -- final utilized figure or the freed budget would stay unusable.
  IF v_expense.request_id IS NOT NULL THEN
    UPDATE public.budget_requests
    SET project_status = 'Completed',
        approved_amount = CASE WHEN v_returned > 0 THEN v_actual ELSE approved_amount END,
        updated_at = v_now
    WHERE id = v_expense.request_id;
  END IF;

  IF v_returned > 0 THEN
    INSERT INTO public.audit_trail (
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

-- ---------------------------------------------------------------------------
-- reopen_project_event: reverse a completion. If budget was returned, it is
-- re-committed to the record; the capacity trigger on budget_requests will
-- reject the reversal if the freed money has since been consumed by newer
-- requests, which rolls the whole transaction back.
-- ---------------------------------------------------------------------------
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
    INSERT INTO public.audit_trail (
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

GRANT EXECUTE ON FUNCTION public.complete_project_event(BIGINT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_project_event(BIGINT, TEXT) TO authenticated;
