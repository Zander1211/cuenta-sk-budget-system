BEGIN;
LOCK TABLE public.budgets, public.monthly_budget_additions IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.monthly_budget_additions
  ADD COLUMN IF NOT EXISTS added_by_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS opening_record_key text;
CREATE UNIQUE INDEX IF NOT EXISTS monthly_budget_opening_record_unique
  ON public.monthly_budget_additions (opening_record_key);

UPDATE public.monthly_budget_additions a
SET added_by_name = COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''),
  NULLIF(u.raw_user_meta_data->>'name', ''), '')
FROM auth.users u WHERE a.created_by = u.id AND a.added_by_name = '';

-- Recover original allocation rows archived when monthly totals were
-- consolidated. Only use them if their sum exactly matches the unrepresented
-- opening balance; never infer extra money or change the monthly total.
WITH archived AS (
  SELECT (original_row->>'month')::integer AS month,
    (original_row->>'year')::integer AS year,
    sum((original_row->>'amount')::numeric) AS total
  FROM public.budget_allocation_archive GROUP BY 1, 2
), represented AS (
  SELECT month, year, sum(amount) AS total FROM public.monthly_budget_additions GROUP BY 1, 2
)
INSERT INTO public.monthly_budget_additions
  (operation_id, month, year, amount, previous_amount, resulting_amount,
    source, description, created_by, added_by_name, created_at, opening_record_key)
SELECT gen_random_uuid(), b.month, b.year, (a.original_row->>'amount')::numeric,
  0, (a.original_row->>'amount')::numeric,
  COALESCE(a.original_row->>'source', ''), COALESCE(a.original_row->>'description', ''),
  u.id, COALESCE(a.original_row->>'added_by_name', ''),
  COALESCE((a.original_row->>'created_at')::timestamptz, b.created_at::timestamptz),
  'archive:' || a.original_id
FROM public.budgets b JOIN archived t USING (month, year)
LEFT JOIN represented r USING (month, year)
JOIN public.budget_allocation_archive a
  ON (a.original_row->>'month')::integer = b.month AND (a.original_row->>'year')::integer = b.year
LEFT JOIN auth.users u ON u.id = COALESCE(NULLIF(a.original_row->>'created_by', ''),
  NULLIF(a.original_row->>'added_by', ''))::uuid
WHERE b.amount - COALESCE(r.total, 0) = t.total AND t.total > 0
  AND (a.original_row->>'amount')::numeric > 0
ON CONFLICT (opening_record_key) DO NOTHING;

-- Existing non-archived balances predate the additions ledger. Record their
-- original amount/date/creator once, independently of all later additions.
INSERT INTO public.monthly_budget_additions
  (operation_id, month, year, amount, previous_amount, resulting_amount,
    source, description, created_by, added_by_name, created_at, opening_record_key)
SELECT gen_random_uuid(), b.month, b.year, b.amount - COALESCE(a.total, 0),
  0, b.amount - COALESCE(a.total, 0), COALESCE(b.source, ''), COALESCE(b.description, ''),
  b.created_by, COALESCE(b.added_by_name, ''), b.created_at::timestamptz, 'budget:' || b.id::text
FROM public.budgets b LEFT JOIN (
  SELECT month, year, sum(amount) AS total FROM public.monthly_budget_additions GROUP BY 1, 2
) a USING (month, year)
WHERE b.amount > COALESCE(a.total, 0)
ON CONFLICT (opening_record_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.stamp_budget_allocation_creator()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.added_by_name := COALESCE(NULLIF(NEW.added_by_name, ''),
    NULLIF(auth.jwt()->'user_metadata'->>'full_name', ''),
    NULLIF(auth.jwt()->'user_metadata'->>'name', ''), '');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS stamp_budget_allocation_creator ON public.monthly_budget_additions;
CREATE TRIGGER stamp_budget_allocation_creator BEFORE INSERT ON public.monthly_budget_additions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_budget_allocation_creator();

-- The RPC definition below also returns the inserted allocation. The caller
-- can show the new history card immediately without waiting for realtime.

CREATE OR REPLACE FUNCTION public.add_monthly_budget_funds(
  p_month integer, p_year integer, p_amount numeric, p_operation_id uuid,
  p_source text DEFAULT '', p_description text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_budget public.budgets%ROWTYPE;
  v_addition public.monthly_budget_additions%ROWTYPE;
  v_source text := trim(COALESCE(p_source, ''));
  v_description text := trim(COALESCE(p_description, ''));
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND (
    auth.uid() IS NULL OR COALESCE(auth.jwt()->'app_metadata'->>'role',
      auth.jwt()->'user_metadata'->>'role', '') <> 'SK Treasurer'
  ) THEN
    RAISE EXCEPTION 'Sign in as SK Treasurer to add budget funds' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL OR p_month NOT BETWEEN 1 AND 12 OR p_year IS NULL
    OR p_year NOT BETWEEN 2000 AND 2100 OR p_amount IS NULL OR p_amount <= 0
    OR p_amount >= 'Infinity'::numeric OR round(p_amount, 2) <> p_amount
    OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'A valid month, year, positive amount in centavos, and operation ID are required'
      USING ERRCODE = '23514';
  END IF;

  -- Serialize retries of one operation as well as concurrent additions to one
  -- period. A lost response can be retried without adding the money twice.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  PERFORM pg_advisory_xact_lock(p_year, p_month);
  SELECT * INTO v_addition FROM public.monthly_budget_additions WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_addition.month <> p_month OR v_addition.year <> p_year OR v_addition.amount <> p_amount
      OR v_addition.source <> v_source OR v_addition.description <> v_description
      OR v_addition.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'This operation ID was already used for a different addition' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO STRICT v_budget FROM public.budgets WHERE month = p_month AND year = p_year;
    RETURN jsonb_build_object('budget', to_jsonb(v_budget), 'added_amount', v_addition.amount,
      'previous_amount', v_addition.previous_amount, 'resulting_amount', v_addition.resulting_amount,
      'replayed', true, 'addition', to_jsonb(v_addition));
  END IF;

  INSERT INTO public.budgets AS b (month, year, quarter, amount, source, description)
    VALUES (p_month, p_year, ((p_month - 1) / 3) + 1, p_amount, v_source, v_description)
    ON CONFLICT (year, month) DO UPDATE SET
      amount = b.amount + EXCLUDED.amount,
      source = CASE WHEN v_source = '' THEN b.source
        WHEN COALESCE(b.source, '') IN ('', v_source) THEN v_source ELSE 'Multiple sources' END,
      description = CASE WHEN v_description = '' THEN b.description ELSE v_description END
    RETURNING * INTO v_budget;

  INSERT INTO public.monthly_budget_additions
    (operation_id, month, year, amount, previous_amount, resulting_amount, source, description, created_by)
    VALUES (p_operation_id, p_month, p_year, p_amount, v_budget.amount - p_amount,
      v_budget.amount, v_source, v_description, auth.uid())
    RETURNING * INTO v_addition;

  RETURN jsonb_build_object('budget', to_jsonb(v_budget), 'added_amount', p_amount,
    'previous_amount', v_budget.amount - p_amount, 'resulting_amount', v_budget.amount, 'replayed', false, 'addition', to_jsonb(v_addition));
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'monthly_budget_additions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.monthly_budget_additions;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
