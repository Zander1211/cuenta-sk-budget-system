-- Run after 20261011000000_persist_monthly_budgets.sql. All test data rolls back.
BEGIN;
DO $$
DECLARE
  actor uuid;
BEGIN
  SELECT id INTO actor FROM auth.users
  WHERE COALESCE(raw_app_meta_data->>'role', raw_user_meta_data->>'role') = 'SK Treasurer'
  LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'A treasurer account is required for this check'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated',
    'user_metadata', json_build_object('full_name', 'Budget verification', 'role', 'SK Treasurer'))::text, true);
  -- Never replace a real record in a verification run.
  IF EXISTS (SELECT 1 FROM public.budgets WHERE year IN (2098, 2099) AND month = 8) THEN
    RAISE EXCEPTION 'Verification period is occupied; choose empty test periods';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  first_row public.budgets%ROWTYPE;
  saved_row public.budgets%ROWTYPE;
BEGIN
  INSERT INTO public.budgets (month, year, quarter, amount, source, description)
    VALUES (8, 2099, 3, 70000, 'Regular SK Budget', 'Verification only')
    ON CONFLICT (year, month) DO UPDATE SET amount = EXCLUDED.amount
    RETURNING * INTO first_row;
  IF first_row.created_by IS DISTINCT FROM auth.uid() OR first_row.created_at IS NULL
    OR first_row.updated_at IS NULL THEN RAISE EXCEPTION 'Creation metadata missing'; END IF;

  INSERT INTO public.budgets (month, year, quarter, amount, source, description)
    VALUES (8, 2099, 3, 80000, 'Donation', 'Updated verification')
    ON CONFLICT (year, month) DO UPDATE SET amount = EXCLUDED.amount,
      source = EXCLUDED.source, description = EXCLUDED.description
    RETURNING * INTO saved_row;
  IF saved_row.id <> first_row.id OR saved_row.amount <> 80000
    OR saved_row.month <> 8 OR saved_row.year <> 2099 OR saved_row.quarter <> 3
    OR saved_row.created_at IS DISTINCT FROM first_row.created_at
    OR saved_row.created_by IS DISTINCT FROM first_row.created_by
    OR saved_row.updated_at <= first_row.updated_at THEN
    RAISE EXCEPTION 'Update did not preserve identity, period, or creation metadata';
  END IF;
  IF (SELECT count(*) FROM public.budgets WHERE month = 8 AND year = 2099) <> 1 THEN
    RAISE EXCEPTION 'Duplicate monthly budget'; END IF;

  INSERT INTO public.budgets (month, year, quarter, amount) VALUES (8, 2098, 3, 12345);
  IF (SELECT amount FROM public.budgets WHERE month = 8 AND year = 2099) <> 80000 THEN
    RAISE EXCEPTION 'Saving another year overwrote the selected year'; END IF;
  BEGIN
    INSERT INTO public.budgets (month, year, quarter, amount) VALUES (8, 2099, 3, 90000);
    RAISE EXCEPTION 'Duplicate insert was allowed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.budgets (month, year, quarter, amount) VALUES (13, 2099, 5, 1);
    RAISE EXCEPTION 'Invalid month was allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.budgets SET amount = -1 WHERE month = 8 AND year = 2099;
    RAISE EXCEPTION 'Negative amount was allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: insert, update, identity, metadata, year isolation, uniqueness, and validation; test data rolled back' AS result;
