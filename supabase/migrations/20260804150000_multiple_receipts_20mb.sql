-- Allow unlimited receipt attachments per Project, Event, or Payroll record.
-- The application enforces a 20 MB limit per individual file.

UPDATE storage.buckets
SET file_size_limit = 20971520,
    allowed_mime_types = ARRAY[
      'image/jpeg',
      'image/png',
      'application/pdf'
    ]::text[]
WHERE id = 'receipts';

DROP POLICY IF EXISTS "SK Chairman and SK Treasurer can insert receipts" ON storage.objects;
CREATE POLICY "SK Chairman and SK Treasurer can insert receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role'
  ) IN ('SK Chairman', 'SK Treasurer')
);

DROP POLICY IF EXISTS "SK Chairman and SK Treasurer can insert receipt records"
ON public.receipt_records;
CREATE POLICY "SK Chairman and SK Treasurer can insert receipt records"
ON public.receipt_records FOR INSERT
TO authenticated
WITH CHECK (
  COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role'
  ) IN ('SK Chairman', 'SK Treasurer')
);

CREATE INDEX IF NOT EXISTS idx_receipt_records_record_type_id
ON public.receipt_records(record_type, record_id);
