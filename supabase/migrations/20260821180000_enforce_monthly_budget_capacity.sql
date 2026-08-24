-- Keep monthly budget commitments consistent under concurrent submissions and
-- approvals. Pending requests reserve capacity; approved requests consume it.

CREATE OR REPLACE FUNCTION public.validate_budget_request_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month integer;
  v_year integer;
  v_budget numeric := 0;
  v_existing_commitments numeric := 0;
  v_new_commitment numeric := 0;
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

  -- Serialize every capacity decision for the same month and year.
  PERFORM pg_advisory_xact_lock(v_year, v_month);

  SELECT COALESCE(SUM(amount), 0)
  INTO v_budget
  FROM public.budgets
  WHERE month = v_month AND year = v_year;

  SELECT COALESCE(SUM(
    CASE WHEN status = 'Approved' THEN COALESCE(approved_amount, amount, 0)
         ELSE COALESCE(amount, 0)
    END
  ), 0)
  INTO v_existing_commitments
  FROM public.budget_requests
  WHERE id IS DISTINCT FROM NEW.id
    AND archived_at IS NULL
    AND COALESCE(status, 'Pending') IN ('Pending', 'Approved')
    AND event_date IS NOT NULL
    AND EXTRACT(MONTH FROM event_date)::integer = v_month
    AND EXTRACT(YEAR FROM event_date)::integer = v_year;

  v_new_commitment := CASE
    WHEN NEW.status = 'Approved' THEN COALESCE(NEW.approved_amount, NEW.amount, 0)
    ELSE COALESCE(NEW.amount, 0)
  END;

  IF v_budget <= 0 THEN
    RAISE EXCEPTION 'No monthly budget is recorded for %/%', v_month, v_year
      USING ERRCODE = '23514';
  END IF;

  IF v_existing_commitments + v_new_commitment > v_budget THEN
    RAISE EXCEPTION 'Monthly budget exceeded for %/%: budget %, already committed %, requested %',
      v_month, v_year, v_budget, v_existing_commitments, v_new_commitment
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

  v_monthly_budget := v_other_allocations + COALESCE(NEW.amount, 0);

  SELECT COALESCE(SUM(
    CASE WHEN status = 'Approved' THEN COALESCE(approved_amount, amount, 0)
         ELSE COALESCE(amount, 0)
    END
  ), 0)
  INTO v_commitments
  FROM public.budget_requests
  WHERE archived_at IS NULL
    AND COALESCE(status, 'Pending') IN ('Pending', 'Approved')
    AND event_date IS NOT NULL
    AND EXTRACT(MONTH FROM event_date)::integer = NEW.month
    AND EXTRACT(YEAR FROM event_date)::integer = NEW.year;

  IF v_monthly_budget < v_commitments THEN
    RAISE EXCEPTION 'Monthly budget for %/% cannot be lower than committed requests: %',
      NEW.month, NEW.year, v_commitments
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_monthly_budget_capacity ON public.budgets;
CREATE TRIGGER enforce_monthly_budget_capacity
BEFORE INSERT OR UPDATE OF amount, month, year
ON public.budgets
FOR EACH ROW
EXECUTE FUNCTION public.validate_monthly_budget_capacity();

COMMENT ON FUNCTION public.validate_budget_request_capacity() IS
  'Atomically prevents pending and approved requests from exceeding their monthly budget.';
COMMENT ON FUNCTION public.validate_monthly_budget_capacity() IS
  'Prevents a monthly budget from being reduced below pending and approved commitments.';
