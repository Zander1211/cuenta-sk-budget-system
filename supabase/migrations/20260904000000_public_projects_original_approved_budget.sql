-- ================================================================
-- Cuenta: Public portal shows the ORIGINAL approved budget
--
-- 20260903000000_return_unused_budget_on_completion.sql returns unused
-- money to the month when a Project/Event is marked Completed. It does so
-- by overwriting expenses.approved_budget and expenses.amount with the
-- amount actually used, keeping the real figure in original_approved_budget.
--
-- public_projects still read approved_budget, so every completed project
-- with a returned balance published "Approved = Spent, 100% utilised,
-- ₱0 remaining" - the return was invisible and the card looked like the
-- whole allocation had been consumed. On a transparency page that is the
-- wrong claim.
--
-- This redefinition keeps the internal return mechanism exactly as is and
-- only changes what the public sees:
--
--   Approved  = the budget that was actually approved for the project
--               (original_approved_budget when a return happened, else
--               approved_budget/amount as before)
--   Spent     = verified receipt totals only (or the manual override),
--               unchanged from 20260819170000
--   Remaining = Approved - Spent, i.e. the amount that went back to the
--               month's budget
--
-- Everything else - column list, NULL-means-unreported semantics,
-- security_barrier, grants - is preserved. Because DROP VIEW loses grants,
-- they are re-issued at the end.
-- ================================================================

DROP VIEW IF EXISTS public.public_projects;

CREATE VIEW public.public_projects
WITH (security_barrier = true) AS
SELECT
  e.public_slug AS id,
  COALESCE(e.project, e.event, 'Published project') AS name,
  COALESCE(e.public_description, e.description) AS description,
  COALESCE(e.category, 'Other Approved Programs') AS category,

  -- The approved budget as it was approved, not as it stands after the
  -- unused portion was returned on completion.
  COALESCE(e.original_approved_budget, e.approved_budget, e.amount, 0) AS approved_allocation,

  -- Manual override first, then verified receipts, then unknown.
  COALESCE(NULLIF(e.public_recorded_expenditure, 0), v.verified_total) AS actual_expenditure,

  -- Lets the portal distinguish "nothing spent" from "nothing reported".
  (COALESCE(NULLIF(e.public_recorded_expenditure, 0), v.verified_total) IS NOT NULL)
    AS expenditure_reported,

  COALESCE(v.receipt_count, 0) AS verified_receipt_count,

  CASE
    WHEN COALESCE(NULLIF(e.public_recorded_expenditure, 0), v.verified_total) IS NULL THEN NULL
    ELSE GREATEST(
      COALESCE(e.original_approved_budget, e.approved_budget, e.amount, 0)
        - COALESCE(NULLIF(e.public_recorded_expenditure, 0), v.verified_total),
      0
    )
  END AS remaining_amount,

  COALESCE(e.project_status, e.status, 'Approved') AS status,
  e.implementation_start,
  e.implementation_end,
  e.target_beneficiaries,
  e.public_progress AS progress_update,

  -- An explicitly published progress figure still wins. Otherwise utilisation
  -- is derived against the original approved budget, and stays NULL while no
  -- expenditure has been reported so the portal shows no bar rather than a
  -- misleading 0%.
  COALESCE(
    e.public_progress_percent,
    CASE
      WHEN COALESCE(NULLIF(e.public_recorded_expenditure, 0), v.verified_total) IS NULL THEN NULL
      WHEN COALESCE(e.original_approved_budget, e.approved_budget, e.amount, 0) > 0 THEN
        LEAST(
          100,
          ROUND(
            (COALESCE(NULLIF(e.public_recorded_expenditure, 0), v.verified_total)
              / COALESCE(e.original_approved_budget, e.approved_budget, e.amount, 0)) * 100,
            1
          )
        )
      ELSE NULL
    END
  ) AS progress_percent,

  COALESCE(e.published_at, e.approved_at, e.created_at) AS last_updated

FROM public.expenses e
LEFT JOIN LATERAL (
  SELECT
    SUM(
      CASE
        -- Guard the cast: a malformed value must not error the whole view.
        WHEN jsonb_typeof(r.ocr_metadata -> 'totalAmount') = 'number'
          THEN (r.ocr_metadata ->> 'totalAmount')::numeric
        ELSE NULL
      END
    ) AS verified_total,
    COUNT(*) FILTER (
      WHERE jsonb_typeof(r.ocr_metadata -> 'totalAmount') = 'number'
    ) AS receipt_count
  FROM public.receipt_records r
  WHERE r.record_id = e.id::text
    -- Only receipts a person confirmed in the review step. Raw OCR output is
    -- never published as a financial figure.
    AND r.ocr_verified_at IS NOT NULL
    AND r.ocr_metadata IS NOT NULL
) v ON TRUE

WHERE e.transparency_status = 'published'
  AND e.project_status = 'Completed'
  AND e.public_slug IS NOT NULL
  AND e.archived_at IS NULL
  AND COALESCE(e.is_additional, false) = false;

REVOKE ALL ON public.public_projects FROM PUBLIC;
GRANT SELECT ON public.public_projects TO anon, authenticated;

COMMENT ON VIEW public.public_projects IS
  'Public-safe project transparency data; excludes receipts, notes, users, workflow comments, and internal identifiers. approved_allocation is the budget as originally approved (original_approved_budget when unused budget was returned on completion). Actual expenditure is the sum of human-verified receipt totals, or a manually published figure where one is set, and is NULL when no expenditure has been reported.';
