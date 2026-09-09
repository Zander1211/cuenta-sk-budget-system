-- ================================================================
-- Cuenta: Receipt deletion policies
-- ================================================================
-- create_receipt_records.sql and create_receipts_bucket.sql shipped SELECT/
-- INSERT/UPDATE policies for receipts but no DELETE policy on either the
-- `receipt_records` table or the `receipts` storage bucket — deleting a
-- receipt (from the main Receipts page or a Project/Event's own Receipts
-- button) needs both, or Postgres/Storage silently deny the row/object
-- delete under RLS even though the request itself succeeds.
--
-- Same role check and phrasing as the existing insert/update policies, so
-- this is additive only: it does not touch who can already view or upload.

-- 1. Policy: Delete receipt records (SK Chairman, SK Treasurer)
CREATE POLICY "SK Chairman and SK Treasurer can delete receipt records"
ON public.receipt_records FOR DELETE
TO authenticated
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') IN ('SK Chairman', 'SK Treasurer')
);

-- 2. Policy: Delete receipt files from storage (SK Chairman, SK Treasurer)
CREATE POLICY "SK Chairman and SK Treasurer can delete receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts' AND
  (auth.jwt() -> 'user_metadata' ->> 'role') IN ('SK Chairman', 'SK Treasurer')
);
