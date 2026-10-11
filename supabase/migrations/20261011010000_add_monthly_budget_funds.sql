BEGIN;

-- Keep one monthly total and retain the individual additions separately.
CREATE TABLE IF NOT EXISTS public.monthly_budget_additions (
  operation_id uuid PRIMARY KEY,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  amount numeric NOT NULL CHECK (amount > 0 AND amount < 'Infinity'::numeric),
  previous_amount numeric NOT NULL,
  resulting_amount numeric NOT NULL,
  source text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.monthly_budget_additions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monthly_budget_additions FROM anon, authenticated;
GRANT SELECT ON public.monthly_budget_additions TO authenticated;
DROP POLICY IF EXISTS "Read monthly budget additions" ON public.monthly_budget_additions;
CREATE POLICY "Read monthly budget additions" ON public.monthly_budget_additions
  FOR SELECT TO authenticated USING (true);

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
      'replayed', true);
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
      v_budget.amount, v_source, v_description, auth.uid());

  RETURN jsonb_build_object('budget', to_jsonb(v_budget), 'added_amount', p_amount,
    'previous_amount', v_budget.amount - p_amount, 'resulting_amount', v_budget.amount, 'replayed', false);
END;
$$;
REVOKE ALL ON FUNCTION public.add_monthly_budget_funds(integer, integer, numeric, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_monthly_budget_funds(integer, integer, numeric, uuid, text, text) TO authenticated, service_role;
COMMENT ON TABLE public.budgets IS 'One cumulative monthly total; Save Budget adds funds through add_monthly_budget_funds.';
NOTIFY pgrst, 'reload schema';
COMMIT;
