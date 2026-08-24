-- Where a parent has exactly one requisition and all of its existing receipts
-- were verified during the legacy "additional expense" workflow, preserve the
-- intended relationship while keeping every file in the parent's collection.
WITH sole_requisition AS (
  SELECT parent_project_id, (array_agg(id))[1] AS requisition_id
  FROM public.expenses
  WHERE is_additional = true
    AND parent_project_id IS NOT NULL
  GROUP BY parent_project_id
  HAVING count(*) = 1
), eligible_parent AS (
  SELECT receipt.record_id
  FROM public.receipt_records receipt
  JOIN sole_requisition sole ON sole.parent_project_id::text = receipt.record_id
  GROUP BY receipt.record_id
  HAVING count(*) > 0
    AND count(*) FILTER (WHERE receipt.ocr_verified_at IS NOT NULL) = count(*)
    AND count(*) FILTER (WHERE receipt.requisition_id IS NOT NULL) = 0
)
UPDATE public.receipt_records receipt
SET requisition_id = sole.requisition_id::text
FROM sole_requisition sole
JOIN eligible_parent eligible ON eligible.record_id = sole.parent_project_id::text
WHERE receipt.record_id = sole.parent_project_id::text
  AND receipt.requisition_id IS NULL;

NOTIFY pgrst, 'reload schema';
