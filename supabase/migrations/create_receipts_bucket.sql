-- ================================================================
-- Cuenta: Create Receipts Bucket and Storage Policies
-- ================================================================
-- 1. Create the receipts bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow all authenticated users to view receipts
CREATE POLICY "Users can view all receipts" 
ON storage.objects FOR SELECT 
TO authenticated 
USING ( bucket_id = 'receipts' );

-- 3. Allow SK Chairman and SK Treasurer to upload receipts
CREATE POLICY "SK Chairman and SK Treasurer can insert receipts" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK ( 
  bucket_id = 'receipts' AND 
  (auth.jwt() -> 'user_metadata' ->> 'role') IN ('SK Chairman', 'SK Treasurer') 
);

-- 4. Allow SK Chairman and SK Treasurer to update receipts
CREATE POLICY "SK Chairman and SK Treasurer can update receipts" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING ( 
  bucket_id = 'receipts' AND 
  (auth.jwt() -> 'user_metadata' ->> 'role') IN ('SK Chairman', 'SK Treasurer') 
);
