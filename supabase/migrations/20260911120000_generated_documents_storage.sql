-- ================================================================
-- Cuenta: Generated Documents Storage Bucket
-- ================================================================
-- Print / Save as PDF on a generated document (Purchase Request,
-- Disbursement Voucher, etc.) now captures a real PDF client-side and
-- uploads it here so it can be listed under the originating Project/Event's
-- Generated Documents history, same as the `receipts` bucket does for
-- uploaded receipts. The `documents` table's file_name/file_path/storage_url
-- columns already exist (see 20260821210000_document_tracking_metadata.sql)
-- and were previously always null; this bucket is what starts populating them.

-- 1. Create the generated-documents bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-documents', 'generated-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow all authenticated users to view/download generated documents
CREATE POLICY "Users can view all generated documents"
ON storage.objects FOR SELECT
TO authenticated
USING ( bucket_id = 'generated-documents' );

-- 3. Allow SK Chairman and SK Treasurer to upload generated documents
CREATE POLICY "SK Chairman and SK Treasurer can insert generated documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'generated-documents' AND
  COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role'
  ) IN ('SK Chairman', 'SK Treasurer')
);

-- 4. Allow SK Chairman and SK Treasurer to update generated documents
CREATE POLICY "SK Chairman and SK Treasurer can update generated documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'generated-documents' AND
  COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role'
  ) IN ('SK Chairman', 'SK Treasurer')
);
