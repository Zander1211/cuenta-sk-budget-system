-- Preserve the metadata for every cumulative monthly budget allocation.
-- Multiple rows for the same month/year are intentional financial history.

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS added_by uuid,
  ADD COLUMN IF NOT EXISTS added_by_name text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_budgets_period_created_at
  ON public.budgets (year, month, created_at DESC);

-- Recover metadata for historical allocations that already have a matching
-- append-only audit event. Timestamp, period, amount, and source must all
-- match, so unrelated rows cannot be associated accidentally.
UPDATE public.budgets AS budget
SET
  added_by = audit.user_id,
  added_by_name = COALESCE(NULLIF(audit.user_name, ''), 'SK Treasurer'),
  description = COALESCE(
    NULLIF(audit.new_value->>'description', ''),
    NULLIF(audit.description, ''),
    budget.description
  )
FROM public.audit_trail AS audit
WHERE audit.action_type = 'Budget Created'
  AND audit.new_value IS NOT NULL
  AND budget.month = (audit.new_value->>'month')::integer
  AND budget.year = (audit.new_value->>'year')::integer
  AND budget.amount = (audit.new_value->>'amount')::numeric
  AND COALESCE(budget.source, '') = COALESCE(audit.new_value->>'source', '')
  AND ABS(EXTRACT(EPOCH FROM (budget.created_at - audit.created_at))) < 1;

COMMENT ON TABLE public.budgets IS
  'Append-only allocation history. Same-month rows are cumulative and must not be merged.';

COMMENT ON COLUMN public.budgets.amount IS
  'Amount of this individual allocation, not the total for the month.';

COMMENT ON COLUMN public.budgets.description IS
  'Optional purpose or notes supplied when the allocation was added.';

COMMENT ON COLUMN public.budgets.added_by IS
  'Authenticated user id that added this allocation.';

COMMENT ON COLUMN public.budgets.added_by_name IS
  'Display name captured when this allocation was added.';
