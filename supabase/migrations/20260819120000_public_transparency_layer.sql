-- Deliberately published, read-only transparency surface.
-- Base tables remain inaccessible to anon; the views contain only public-safe fields.

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS transparency_status text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS public_category text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS is_additional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transparency_status text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS public_description text,
  ADD COLUMN IF NOT EXISTS target_beneficiaries text,
  ADD COLUMN IF NOT EXISTS implementation_start date,
  ADD COLUMN IF NOT EXISTS implementation_end date,
  ADD COLUMN IF NOT EXISTS public_progress text,
  ADD COLUMN IF NOT EXISTS public_progress_percent numeric,
  ADD COLUMN IF NOT EXISTS public_slug text,
  ADD COLUMN IF NOT EXISTS public_recorded_expenditure numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.budgets ADD CONSTRAINT budgets_transparency_status_check
    CHECK (transparency_status IN ('internal', 'draft', 'ready_for_publication', 'published'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_transparency_status_check
    CHECK (transparency_status IN ('internal', 'draft', 'ready_for_publication', 'published'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_public_progress_percent_check
    CHECK (public_progress_percent IS NULL OR public_progress_percent BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Automatically publish completed, approved public-facing projects and events. Payroll and
-- additional expense rows remain private. The UUID suffix prevents slug clashes
-- without exposing the underlying database identifier.
CREATE OR REPLACE FUNCTION public.sync_approved_expense_transparency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  v_title := COALESCE(NULLIF(NEW.project, ''), NULLIF(NEW.event, ''), 'approved-project');

  IF NEW.status IN ('Approved', 'Released')
     AND NEW.project_status = 'Completed'
     AND COALESCE(NEW.is_additional, false) = false
     AND COALESCE(NEW.type, 'Project') IN ('Project', 'Event')
     AND NEW.archived_at IS NULL THEN
    NEW.transparency_status := 'published';
    NEW.public_slug := COALESCE(
      NULLIF(NEW.public_slug, ''),
      TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(v_title), '[^a-z0-9]+', '-', 'g'))
        || '-' || LEFT(REPLACE(NEW.id::text, '-', ''), 8)
    );
    NEW.published_at := COALESCE(NEW.published_at, now());
  ELSE
    NEW.transparency_status := 'internal';
    NEW.published_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_approved_expense_transparency() FROM PUBLIC;

DROP TRIGGER IF EXISTS sync_approved_expense_transparency_trigger ON public.expenses;
CREATE TRIGGER sync_approved_expense_transparency_trigger
BEFORE INSERT OR UPDATE OF status, project_status, project, event, type, is_additional, archived_at
ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.sync_approved_expense_transparency();

-- Publish existing eligible records as part of the migration. This UPDATE also
-- runs the trigger so slug and publication timestamps are populated consistently.
UPDATE public.expenses
SET status = status
WHERE status IN ('Approved', 'Released')
  AND COALESCE(is_additional, false) = false
  AND COALESCE(type, 'Project') IN ('Project', 'Event')
  AND archived_at IS NULL;

DROP VIEW IF EXISTS public.public_budget_allocations;
DROP VIEW IF EXISTS public.public_expenditure_summary;
DROP VIEW IF EXISTS public.public_projects;

CREATE VIEW public.public_projects
WITH (security_barrier = true) AS
SELECT public_slug AS id, COALESCE(project, event, 'Published project') AS name,
       COALESCE(public_description, description) AS description,
       COALESCE(category, 'Other Approved Programs') AS category,
       COALESCE(approved_budget, amount, 0) AS approved_allocation,
       COALESCE(public_recorded_expenditure, 0) AS actual_expenditure,
       GREATEST(COALESCE(approved_budget, amount, 0) - COALESCE(public_recorded_expenditure, 0), 0) AS remaining_amount,
       COALESCE(project_status, status, 'Approved') AS status,
       implementation_start,
       implementation_end,
       target_beneficiaries,
       public_progress AS progress_update,
       COALESCE(public_progress_percent,
         CASE WHEN COALESCE(approved_budget, amount, 0) > 0
           THEN LEAST(100, ROUND((COALESCE(public_recorded_expenditure, 0) / COALESCE(approved_budget, amount, 0)) * 100, 1))
           ELSE 0 END
       ) AS progress_percent,
       COALESCE(published_at, approved_at, created_at) AS last_updated
FROM public.expenses
WHERE transparency_status = 'published'
  AND project_status = 'Completed'
  AND public_slug IS NOT NULL
  AND archived_at IS NULL
  AND COALESCE(is_additional, false) = false;

REVOKE ALL ON public.budgets, public.expenses FROM anon;
REVOKE ALL ON public.public_projects FROM PUBLIC;
GRANT SELECT ON public.public_projects TO anon, authenticated;

COMMENT ON VIEW public.public_projects IS 'Public-safe project transparency data; excludes receipts, notes, users, workflow comments, and internal identifiers.';
