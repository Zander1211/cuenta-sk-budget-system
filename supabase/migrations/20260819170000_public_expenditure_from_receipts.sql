-- ================================================================
-- Cuenta: Publish actual expenditure from verified receipts
--
-- Before this migration `public_recorded_expenditure` was the only source of
-- the public "Spent" figure. Nothing ever wrote to it, so every published
-- project reported 0 spent and 100% remaining. On a page whose whole purpose
-- is accountability, a completed project claiming zero expenditure is worse
-- than publishing nothing at all.
--
-- Expenditure now comes from receipts a person has actually verified through
-- the receipt scanner. Two consequences that matter:
--
--   * "no receipts recorded yet" is NULL, not 0. The two are different claims
--     and the portal renders them differently. A project genuinely spending
--     nothing would have a verified receipt totalling 0, which still reads as
--     0 here.
--   * `public_recorded_expenditure` is kept as a manual override. When a
--     treasurer sets it, it wins. This preserves the original editorial intent
--     while giving the column an automatic source when it is left alone.
--
-- Only the aggregate leaves this view. Receipt paths, file names, uploader
-- identity and OCR field values are never exposed. The view runs with its
-- owner's rights over receipt_records, so `anon` reads the total without
-- holding any privilege on the receipts table itself.
--
-- Depends on 20260819160000_receipt_scan_metadata.sql for ocr_metadata,
-- ocr_verified_at and is_scanned. Run these in order.
-- ================================================================

DROP VIEW IF EXISTS public.public_projects;

CREATE VIEW public.public_projects
WITH (security_barrier = true) AS
SELECT
  e.public_slug AS id,
  COALESCE(e.project, e.event, 'Published project') AS name,
  COALESCE(e.public_description, e.description) AS description,
  COALESCE(e.category, 'Other Approved Programs') AS category,
  COALESCE(e.approved_budget, e.amount, 0) AS approved_allocation,

  -- Manual override first, then verified receipts, then unknown.
  COALESCE(NULLIF(e.public_recorded_expenditure, 0), v.verified_total) AS actual_expenditure,

  -- Lets the portal distinguish "nothing spent" from "nothing reported".
  (COALESCE(NULLIF(e.public_recorded_expenditure, 0), v.verified_total) IS NOT NULL)
    AS expenditure_reported,

  COALESCE(v.receipt_count, 0) AS verified_receipt_count,

  CASE
    WHEN COALESCE(NULLIF(e.public_recorded_expenditure, 0), v.verified_total) IS NULL THEN NULL
    ELSE GREATEST(
      COALESCE(e.approved_budget, e.amount, 0)
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
  -- is derived, and stays NULL while no expenditure has been reported so the
  -- portal shows no bar rather than a misleading 0%.
  COALESCE(
    e.public_progress_percent,
    CASE
      WHEN COALESCE(NULLIF(e.public_recorded_expenditure, 0), v.verified_total) IS NULL THEN NULL
      WHEN COALESCE(e.approved_budget, e.amount, 0) > 0 THEN
        LEAST(
          100,
          ROUND(
            (COALESCE(NULLIF(e.public_recorded_expenditure, 0), v.verified_total)
              / COALESCE(e.approved_budget, e.amount, 0)) * 100,
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
  'Public-safe project transparency data; excludes receipts, notes, users, workflow comments, and internal identifiers. Actual expenditure is the sum of human-verified receipt totals, or a manually published figure where one is set, and is NULL when no expenditure has been reported.';

-- The lateral aggregate runs per published project, so the lookup it performs
-- on receipt_records needs to be indexed by the column it joins on.
CREATE INDEX IF NOT EXISTS idx_receipt_records_verified_totals
  ON public.receipt_records (record_id)
  WHERE ocr_verified_at IS NOT NULL;
