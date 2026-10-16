-- 20261016210000_fix_budget_request_validation_and_carry_forward.sql
-- Fix budget request capacity validation to correctly include carried-forward unspent funds
-- from previous completed months and validate only against approved commitments.

-- 1. Helper function to compute cumulative unspent budget carried forward from completed past months
CREATE OR REPLACE FUNCTION public.get_monthly_carry_forward(p_month integer, p_year integer)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carry_forward numeric := 0;
  v_m integer;
  v_allocated numeric;
  v_spent numeric;
  v_returned numeric;
  v_net_used numeric;
  v_remaining numeric;
BEGIN
  IF p_month IS NULL OR p_year IS NULL OR p_month <= 1 THEN
    RETURN 0;
  END IF;

  FOR v_m IN 1..(p_month - 1) LOOP
    -- Base allocated budget for past month v_m
    SELECT COALESCE(SUM(amount), 0)
    INTO v_allocated
    FROM public.budgets
    WHERE month = v_m AND year = p_year;

    -- Only months with an allocated budget carry forward
    IF v_allocated > 0 THEN
      -- Approved expenses in month v_m (parent items only)
      SELECT 
        COALESCE(SUM(COALESCE(approved_budget, amount, 0)), 0),
        COALESCE(SUM(COALESCE(returned_budget, 0)), 0)
      INTO v_spent, v_returned
      FROM (
        SELECT DISTINCT ON (COALESCE(request_id::text, 'exp:' || id::text))
          approved_budget, amount, returned_budget
        FROM public.expenses
        WHERE archived_at IS NULL
          AND status IN ('Approved', 'Released')
          AND is_additional IS NOT TRUE
          AND (
            (month = v_m AND year = p_year)
            OR (month IS NULL AND EXTRACT(MONTH FROM COALESCE(event_date, date, approved_at))::integer = v_m
                AND EXTRACT(YEAR FROM COALESCE(event_date, date, approved_at))::integer = p_year)
          )
        ORDER BY COALESCE(request_id::text, 'exp:' || id::text), id DESC
      ) sub;

      v_net_used := GREATEST(0, v_spent - v_returned);
      v_remaining := GREATEST(0, v_allocated - v_net_used);
      v_carry_forward := v_carry_forward + v_remaining;
    END IF;
  END LOOP;

  RETURN v_carry_forward;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_carry_forward(integer, integer) TO anon, authenticated;

-- 2. Trigger function to validate budget request capacity against actual remaining budget
CREATE OR REPLACE FUNCTION public.validate_budget_request_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month integer;
  v_year integer;
  v_base_budget numeric := 0;
  v_carry_forward numeric := 0;
  v_total_budget numeric := 0;
  v_existing_commitments numeric := 0;
  v_new_commitment numeric := 0;
  v_available_remaining numeric := 0;
BEGIN
  IF NEW.archived_at IS NOT NULL OR COALESCE(NEW.status, 'Pending') NOT IN ('Pending', 'Approved') THEN
    RETURN NEW;
  END IF;

  IF NEW.event_date IS NULL THEN
    RAISE EXCEPTION 'A request date is required to validate monthly budget capacity'
      USING ERRCODE = '23514';
  END IF;

  v_month := EXTRACT(MONTH FROM NEW.event_date)::integer;
  v_year := EXTRACT(YEAR FROM NEW.event_date)::integer;

  -- Serialize capacity decisions for the same month and year
  PERFORM pg_advisory_xact_lock(v_year, v_month);

  -- Retrieve base monthly budget
  SELECT COALESCE(SUM(amount), 0)
  INTO v_base_budget
  FROM public.budgets
  WHERE month = v_month AND year = v_year;

  -- Add carried-forward unspent funds from previous completed months
  v_carry_forward := public.get_monthly_carry_forward(v_month, v_year);
  v_total_budget := v_base_budget + v_carry_forward;

  IF v_total_budget <= 0 THEN
    RAISE EXCEPTION 'No monthly budget is recorded for %/%', v_month, v_year
      USING ERRCODE = '23514';
  END IF;

  -- Existing commitments: count only Approved expenses and requests in this month
  -- (Pending requests do NOT reduce the available remaining balance)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_existing_commitments
  FROM (
    SELECT DISTINCT ON (COALESCE(request_id::text, 'exp:' || id::text))
      COALESCE(approved_budget, amount, 0) - COALESCE(returned_budget, 0) AS amount
    FROM public.expenses
    WHERE archived_at IS NULL
      AND status IN ('Approved', 'Released')
      AND is_additional IS NOT TRUE
      AND (
        (month = v_month AND year = v_year)
        OR (month IS NULL AND EXTRACT(MONTH FROM COALESCE(event_date, date, approved_at))::integer = v_month
            AND EXTRACT(YEAR FROM COALESCE(event_date, date, approved_at))::integer = v_year)
      )
      AND (request_id IS NULL OR request_id IS DISTINCT FROM NEW.id)
    ORDER BY COALESCE(request_id::text, 'exp:' || id::text), id DESC
  ) sub;

  -- Also add any Approved budget_requests that do not yet have an expense row (safety check)
  SELECT v_existing_commitments + COALESCE(SUM(COALESCE(approved_amount, amount, 0)), 0)
  INTO v_existing_commitments
  FROM public.budget_requests
  WHERE id IS DISTINCT FROM NEW.id
    AND archived_at IS NULL
    AND status = 'Approved'
    AND event_date IS NOT NULL
    AND EXTRACT(MONTH FROM event_date)::integer = v_month
    AND EXTRACT(YEAR FROM event_date)::integer = v_year
    AND id NOT IN (
      SELECT request_id FROM public.expenses WHERE request_id IS NOT NULL AND archived_at IS NULL
    );

  v_available_remaining := GREATEST(0, v_total_budget - v_existing_commitments);

  v_new_commitment := CASE
    WHEN NEW.status = 'Approved' THEN COALESCE(NEW.approved_amount, NEW.amount, 0)
    ELSE COALESCE(NEW.amount, 0)
  END;

  IF v_new_commitment > v_available_remaining THEN
    RAISE EXCEPTION 'The requested amount exceeds the remaining available budget for this month.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_budget_request_capacity ON public.budget_requests;
CREATE TRIGGER enforce_budget_request_capacity
BEFORE INSERT OR UPDATE OF amount, approved_amount, status, event_date, archived_at
ON public.budget_requests
FOR EACH ROW
EXECUTE FUNCTION public.validate_budget_request_capacity();

-- 3. Update validate_monthly_budget_capacity to align with approved-only commitments
CREATE OR REPLACE FUNCTION public.validate_monthly_budget_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commitments numeric := 0;
  v_other_allocations numeric := 0;
  v_monthly_budget numeric := 0;
  v_carry_forward numeric := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(NEW.year, NEW.month);

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_other_allocations
    FROM public.budgets
    WHERE month = NEW.month
      AND year = NEW.year
      AND id IS DISTINCT FROM OLD.id;
  ELSE
    SELECT COALESCE(SUM(amount), 0)
    INTO v_other_allocations
    FROM public.budgets
    WHERE month = NEW.month AND year = NEW.year;
  END IF;

  v_carry_forward := public.get_monthly_carry_forward(NEW.month, NEW.year);
  v_monthly_budget := v_other_allocations + COALESCE(NEW.amount, 0) + v_carry_forward;

  SELECT COALESCE(SUM(COALESCE(approved_amount, amount, 0)), 0)
  INTO v_commitments
  FROM public.budget_requests
  WHERE archived_at IS NULL
    AND status = 'Approved'
    AND event_date IS NOT NULL
    AND EXTRACT(MONTH FROM event_date)::integer = NEW.month
    AND EXTRACT(YEAR FROM event_date)::integer = NEW.year;

  IF v_monthly_budget < v_commitments THEN
    RAISE EXCEPTION 'Monthly budget for %/% cannot be lower than approved commitments: %',
      NEW.month, NEW.year, v_commitments
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
