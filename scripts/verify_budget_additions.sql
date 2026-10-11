-- Transactional checks: no test balances or addition records survive.
BEGIN;
DO $$
DECLARE actor uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.budgets WHERE year = 2099 AND month = 8) THEN
    RAISE EXCEPTION 'Test period occupied'; END IF;
  SELECT id INTO STRICT actor FROM auth.users
    WHERE COALESCE(raw_app_meta_data->>'role', raw_user_meta_data->>'role') = 'SK Treasurer' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated',
    'user_metadata', json_build_object('full_name', 'Verification', 'role', 'SK Treasurer'))::text, true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  first_result jsonb;
  second_result jsonb;
  retry_result jsonb;
  operation uuid := gen_random_uuid();
BEGIN
  first_result := public.add_monthly_budget_funds(8, 2099, 50000, gen_random_uuid(), 'Regular SK Budget', 'Test');
  second_result := public.add_monthly_budget_funds(8, 2099, 50000, operation, 'Donation', 'Test');
  IF (second_result->'budget'->>'amount')::numeric <> 100000 THEN
    RAISE EXCEPTION 'Two additions of 50000 must total 100000'; END IF;
  IF first_result->'budget'->>'id' IS DISTINCT FROM second_result->'budget'->>'id'
    OR first_result->'budget'->>'created_at' IS DISTINCT FROM second_result->'budget'->>'created_at'
    OR (second_result->'budget'->>'created_by')::uuid IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Identity/creation metadata was not preserved'; END IF;
  retry_result := public.add_monthly_budget_funds(8, 2099, 50000, operation, 'Donation', 'Test');
  IF NOT (retry_result->>'replayed')::boolean OR (retry_result->'budget'->>'amount')::numeric <> 100000 THEN
    RAISE EXCEPTION 'Retry applied the addition twice'; END IF;
  PERFORM public.add_monthly_budget_funds(8, 2099, 0.75, gen_random_uuid());
  retry_result := public.add_monthly_budget_funds(8, 2099, 50000, operation, 'Donation', 'Test');
  IF (retry_result->'budget'->>'amount')::numeric <> 100000.75 THEN
    RAISE EXCEPTION 'Retry must return the latest monthly total'; END IF;
  IF (SELECT count(*) FROM public.budgets WHERE year=2099 AND month=8) <> 1
    OR (SELECT count(*) FROM public.monthly_budget_additions WHERE year=2099 AND month=8) <> 3 THEN
    RAISE EXCEPTION 'Monthly total or addition history is duplicated'; END IF;
  BEGIN
    PERFORM public.add_monthly_budget_funds(8, 2099, 123, operation);
    RAISE EXCEPTION 'Operation ID reused with different parameters';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.add_monthly_budget_funds(8, 2099, -1, gen_random_uuid());
    RAISE EXCEPTION 'Negative addition accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: 50000 + 50000 = 100000; retries, centavos, history, identity and creator preserved; test data rolled back' AS result;
