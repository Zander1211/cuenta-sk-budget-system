-- Make budget approval durable, idempotent, and atomic.
-- Dashboard totals, monthly utilization, and AI analysis are derived from the
-- expenses row created here, so they update from the same committed data.

ALTER TABLE public.budget_requests
  ADD COLUMN IF NOT EXISTS approved_amount NUMERIC;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS request_id UUID,
  ADD COLUMN IF NOT EXISTS requested_budget NUMERIC,
  ADD COLUMN IF NOT EXISTS approved_budget NUMERIC,
  ADD COLUMN IF NOT EXISTS month INTEGER,
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS requested_by TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS project_status TEXT NOT NULL DEFAULT 'Ongoing',
  ADD COLUMN IF NOT EXISTS expenses_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_request_id
  ON public.expenses(request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  actor_id UUID,
  actor_role TEXT NOT NULL DEFAULT '',
  recipient_role TEXT,
  request_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read notifications" ON public.notifications;
CREATE POLICY "Authenticated users can read notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    recipient_role IS NULL
    OR recipient_role = COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    )
  );

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read expenses" ON public.expenses;
CREATE POLICY "Authenticated users can read expenses"
  ON public.expenses FOR SELECT TO authenticated USING (true);

-- Repair requests that were marked Approved by an older client but never
-- received their destination row.
INSERT INTO public.expenses (
  request_id, event, project, category, type, amount,
  requested_budget, approved_budget, status, approved_at, date, event_date,
  month, year, venue, description, notes, breakdown, expenses_breakdown,
  requested_by, created_by, project_status, updated_at
)
SELECT
  request.id,
  request.event,
  request.event,
  request.category,
  request.type,
  COALESCE(request.approved_amount, request.amount, 0),
  COALESCE(request.amount, 0),
  COALESCE(request.approved_amount, request.amount, 0),
  'Approved',
  COALESCE(request.approved_at, request.updated_at, request.created_at, now()),
  COALESCE(
    request.event_date,
    COALESCE(request.approved_at, request.updated_at, request.created_at, now())::DATE
  ),
  request.event_date,
  EXTRACT(MONTH FROM COALESCE(
    request.event_date,
    COALESCE(request.approved_at, request.updated_at, request.created_at, now())::DATE
  ))::INTEGER,
  EXTRACT(YEAR FROM COALESCE(
    request.event_date,
    COALESCE(request.approved_at, request.updated_at, request.created_at, now())::DATE
  ))::INTEGER,
  request.venue,
  request.description,
  request.notes,
  COALESCE(request.breakdown, '[]'::jsonb),
  COALESCE(request.expenses_breakdown, '[]'::jsonb),
  request.requested_by,
  request.created_by,
  COALESCE(NULLIF(request.project_status, 'Pending'), 'Ongoing'),
  now()
FROM public.budget_requests AS request
WHERE request.status = 'Approved'
  AND request.type IN ('Project', 'Event', 'Payroll')
ON CONFLICT (request_id) WHERE request_id IS NOT NULL DO NOTHING;

-- Accept the canonical role from either JWT metadata location. This fixes
-- deployed accounts whose role is stored in app_metadata rather than
-- user_metadata, while retaining the same Chairman/Treasurer boundary.
DROP POLICY IF EXISTS "SK Chairman and SK Treasurer can insert receipt records"
  ON public.receipt_records;
CREATE POLICY "SK Chairman and SK Treasurer can insert receipt records"
  ON public.receipt_records FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  );

DROP POLICY IF EXISTS "SK Chairman and SK Treasurer can update receipt records"
  ON public.receipt_records;
CREATE POLICY "SK Chairman and SK Treasurer can update receipt records"
  ON public.receipt_records FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS "SK Chairman and SK Treasurer can delete receipt records"
  ON public.receipt_records;
CREATE POLICY "SK Chairman and SK Treasurer can delete receipt records"
  ON public.receipt_records FOR DELETE TO authenticated
  USING (
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  );

DROP POLICY IF EXISTS "SK Chairman and SK Treasurer can insert receipts"
  ON storage.objects;
CREATE POLICY "SK Chairman and SK Treasurer can insert receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  );

DROP POLICY IF EXISTS "SK Chairman and SK Treasurer can update receipts"
  ON storage.objects;
CREATE POLICY "SK Chairman and SK Treasurer can update receipts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  );

DROP POLICY IF EXISTS "SK Chairman and SK Treasurer can delete receipts"
  ON storage.objects;
CREATE POLICY "SK Chairman and SK Treasurer can delete receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  );

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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'expenses'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'budget_requests'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.budget_requests;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END
$$;
