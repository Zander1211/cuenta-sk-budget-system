-- One authoritative monthly total, replacing cumulative allocation rows.
-- Archive every original row in duplicate periods before consolidating them.
BEGIN;

LOCK TABLE public.budgets IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS added_by uuid,
  ADD COLUMN IF NOT EXISTS added_by_name text NOT NULL DEFAULT '';

-- The deployed legacy column referenced public.users, while login accounts
-- and added_by use auth.users. This prevented storing a real treasurer ID.
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_created_by_fkey;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.budget_allocation_archive (
  original_id text PRIMARY KEY,
  original_row jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.budget_allocation_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.budget_allocation_archive FROM anon, authenticated;
GRANT SELECT ON public.budget_allocation_archive TO authenticated;
DROP POLICY IF EXISTS "Read historical budget allocations" ON public.budget_allocation_archive;
CREATE POLICY "Read historical budget allocations"
  ON public.budget_allocation_archive FOR SELECT TO authenticated USING (true);

INSERT INTO public.budget_allocation_archive (original_id, original_row)
SELECT b.id::text, to_jsonb(b)
FROM public.budgets b
JOIN (SELECT year, month FROM public.budgets GROUP BY year, month HAVING count(*) > 1) d
  USING (year, month)
ON CONFLICT (original_id) DO NOTHING;

-- Previous rows were cumulative allocations, so retain their SUM rather than
-- silently discarding funding. The oldest record keeps its identity/creator;
-- all source-specific metadata remains available in the archive.
WITH periods AS (
  SELECT year, month, sum(amount) AS total,
    (array_agg(id ORDER BY created_at NULLS LAST, id))[1] AS keep_id
  FROM public.budgets GROUP BY year, month HAVING count(*) > 1
)
UPDATE public.budgets b SET amount = p.total,
  source = 'Consolidated allocations',
  description = 'Historical allocations consolidated into one monthly total; originals retained in budget_allocation_archive.',
  updated_at = now()
FROM periods p WHERE b.id = p.keep_id;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY year, month ORDER BY created_at NULLS LAST, id) AS position
  FROM public.budgets
)
DELETE FROM public.budgets b USING ranked r WHERE b.id = r.id AND r.position > 1;

UPDATE public.budgets SET
  created_by = COALESCE(created_by, added_by),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now()),
  quarter = ((month - 1) / 3) + 1;

ALTER TABLE public.budgets
  ALTER COLUMN month SET NOT NULL,
  ALTER COLUMN year SET NOT NULL,
  ALTER COLUMN amount SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS budgets_year_month_unique ON public.budgets (year, month);
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_valid_monthly_values;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_valid_monthly_values CHECK (
  month BETWEEN 1 AND 12 AND year BETWEEN 2000 AND 2100
  AND amount >= 0 AND amount < 'Infinity'::numeric
  AND quarter = ((month - 1) / 3) + 1
);

CREATE OR REPLACE FUNCTION public.stamp_monthly_budget()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.quarter := ((NEW.month - 1) / 3) + 1;
  NEW.updated_at := clock_timestamp();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by, NEW.added_by);
    NEW.added_by := NEW.created_by;
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.added_by_name := COALESCE(
      NULLIF(auth.jwt()->'user_metadata'->>'full_name', ''),
      NULLIF(auth.jwt()->'user_metadata'->>'name', ''),
      NULLIF(NEW.added_by_name, ''), 'SK Treasurer');
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.added_by := OLD.added_by;
    NEW.added_by_name := OLD.added_by_name;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_monthly_budget ON public.budgets;
CREATE TRIGGER stamp_monthly_budget BEFORE INSERT OR UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.stamp_monthly_budget();

-- Budgets were absent from this publication in the deployed database.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'budgets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.budgets;
  END IF;
END $$;

COMMENT ON TABLE public.budgets IS 'One total per month/year. Save Budget atomically replaces that period total.';
COMMENT ON COLUMN public.budgets.amount IS 'Total monthly allocation, not an incremental addition.';
COMMENT ON COLUMN public.budgets.created_by IS 'Original creator; historical unknown creators remain NULL.';

NOTIFY pgrst, 'reload schema';
COMMIT;
