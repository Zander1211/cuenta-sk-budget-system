-- Consolidate Additional Expense rows as requisitions owned by one approved
-- Project, Event, or Payroll. The requisition row remains as a line item; it
-- is never an independent allocation or receipt collection.

ALTER TABLE public.receipt_records
  ADD COLUMN IF NOT EXISTS requisition_id TEXT;

COMMENT ON COLUMN public.receipt_records.requisition_id IS
  'Optional expenses.id of the requisition line item. record_id remains the approved parent that owns the receipt collection.';

-- Safely relink legacy requisitions that have no parent only when their copied
-- title and type identify exactly one active approved parent.
WITH candidate_parents AS (
  SELECT
    child.id AS child_id,
    (array_agg(parent.id))[1] AS parent_id,
    count(*) AS match_count
  FROM public.expenses child
  JOIN public.expenses parent
    ON parent.is_additional = false
   AND lower(coalesce(parent.type, '')) = lower(coalesce(child.type, ''))
   AND lower(trim(coalesce(parent.event, parent.project, '')))
       = lower(trim(coalesce(child.event, child.project, '')))
  WHERE child.is_additional = true
    AND child.parent_project_id IS NULL
    AND coalesce(child.event, child.project, '') <> ''
  GROUP BY child.id
)
UPDATE public.expenses child
SET parent_project_id = candidate_parents.parent_id,
    updated_at = now()
FROM candidate_parents
WHERE child.id = candidate_parents.child_id
  AND candidate_parents.match_count = 1;

-- Preserve which requisition supplied an existing receipt, then move the
-- receipt into its approved parent's single collection.
UPDATE public.receipt_records receipt
SET requisition_id = child.id::text,
    record_id = child.parent_project_id::text
FROM public.expenses child
WHERE child.is_additional = true
  AND child.parent_project_id IS NOT NULL
  AND receipt.record_id = child.id::text;

-- Copied titles and zero-value allocation fields made requisitions appear to
-- be separate Projects/Events. Their parent now supplies all parent identity
-- and approved-budget information.
UPDATE public.expenses
SET event = NULL,
    project = NULL,
    requested_budget = 0,
    approved_budget = 0,
    status = 'Recorded',
    updated_at = now()
WHERE is_additional = true
  AND parent_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receipt_records_requisition_id
  ON public.receipt_records(requisition_id)
  WHERE requisition_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_expense_requisition_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_is_requisition BOOLEAN;
  parent_status TEXT;
  parent_type TEXT;
BEGIN
  IF NEW.is_additional = false THEN
    NEW.parent_project_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.parent_project_id IS NULL THEN
    RAISE EXCEPTION 'A requisition must reference an approved parent record';
  END IF;

  SELECT is_additional, lower(coalesce(status, '')), lower(coalesce(type, ''))
  INTO parent_is_requisition, parent_status, parent_type
  FROM public.expenses
  WHERE id = NEW.parent_project_id;

  IF NOT FOUND OR parent_is_requisition
    OR parent_status NOT IN ('approved', 'released')
    OR parent_type NOT IN ('project', 'event', 'payroll') THEN
    RAISE EXCEPTION 'Requisitions can only belong to an active approved Project, Event, or Payroll';
  END IF;

  NEW.event := NULL;
  NEW.project := NULL;
  NEW.requested_budget := 0;
  NEW.approved_budget := 0;
  NEW.status := 'Recorded';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_expense_requisition_parent_trigger ON public.expenses;
CREATE TRIGGER validate_expense_requisition_parent_trigger
BEFORE INSERT OR UPDATE OF is_additional, parent_project_id, status, event, project,
  requested_budget, approved_budget
ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.validate_expense_requisition_parent();

COMMENT ON COLUMN public.expenses.parent_project_id IS
  'Approved Project, Event, or Payroll that owns this requisition line item.';
COMMENT ON COLUMN public.expenses.is_additional IS
  'True for a requisition line item included in its parent approved budget; never an independent allocation.';

NOTIFY pgrst, 'reload schema';
