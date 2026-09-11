-- ================================================================
-- Cuenta: Generated Documents Bucket — Delete Policy
-- ================================================================
-- Editing an already-generated document updates its row in place and
-- uploads a fresh PDF; the superseded PDF is then removed from storage to
-- avoid orphaned files accumulating on every edit. That cleanup needs a
-- DELETE policy on the bucket, which the original migration
-- (20260911120000_generated_documents_storage.sql) didn't include — same
-- gap the receipts bucket had before 20260909000000_receipt_delete_policies.sql.

CREATE POLICY "SK Chairman and SK Treasurer can delete generated documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'generated-documents' AND
  COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role'
  ) IN ('SK Chairman', 'SK Treasurer')
);
