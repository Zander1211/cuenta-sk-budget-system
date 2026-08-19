-- ================================================================
-- Cuenta: Receipt scan support
--
-- Adds the columns needed to keep the processed scan and the original
-- photograph as two distinct artefacts, plus the verified OCR metadata.
--
-- `file_path` deliberately keeps pointing at the image Cuenta displays, which
-- is now the processed scan. Existing rows are unaffected: they have no
-- original_path and are simply treated as un-scanned uploads by the UI, so
-- every receipt uploaded before this migration keeps working untouched.
--
-- No RLS policy is created, altered or dropped here. The existing policies on
-- receipt_records and on storage.objects continue to govern access, so role
-- permissions are unchanged by this migration.
-- ================================================================

ALTER TABLE public.receipt_records
  -- Path to the unmodified camera photograph, when the receipt came through
  -- the scanner. NULL for direct file uploads.
  ADD COLUMN IF NOT EXISTS original_path text,
  -- Verified receipt fields. Written only after a human confirms them in the
  -- review step; OCR output alone never lands here.
  ADD COLUMN IF NOT EXISTS ocr_metadata jsonb,
  -- How the scan was produced: filter, corner positions, rotation, engine
  -- confidence. Kept for auditability of the image itself.
  ADD COLUMN IF NOT EXISTS scan_settings jsonb,
  ADD COLUMN IF NOT EXISTS is_scanned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ocr_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS ocr_verified_by text;

COMMENT ON COLUMN public.receipt_records.original_path IS
  'Unprocessed camera photograph. The scan at file_path is what Cuenta displays.';
COMMENT ON COLUMN public.receipt_records.ocr_metadata IS
  'Human-verified receipt fields. Supplementary to the scan, never a substitute for it. Unreadable fields are stored as null and are never inferred.';

-- Metadata lookups are always scoped to a record, and scanned receipts are
-- queried separately from plain uploads.
CREATE INDEX IF NOT EXISTS idx_receipt_records_is_scanned
  ON public.receipt_records (record_id, is_scanned);
