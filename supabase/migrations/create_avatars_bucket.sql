-- ================================================================
-- Cuenta: Create Avatars Bucket and Storage Policies
-- ================================================================

-- 1. Create the avatars bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true) -- Avatars are public so they can be easily displayed
ON CONFLICT (id) DO NOTHING;

-- 2. Allow all authenticated users to view avatars
CREATE POLICY "Users can view all avatars" 
ON storage.objects FOR SELECT 
TO authenticated 
USING ( bucket_id = 'avatars' );

-- 3. Allow users to insert their own avatars
CREATE POLICY "Users can upload their own avatar" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK ( 
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text 
);

-- 4. Allow users to update their own avatars
CREATE POLICY "Users can update their own avatar" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING ( 
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text 
);
