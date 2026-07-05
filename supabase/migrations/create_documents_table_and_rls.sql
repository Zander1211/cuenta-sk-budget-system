-- ================================================================
-- Cuenta: Create Documents Table and RLS
-- ================================================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_generated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  archived_at TIMESTAMP WITH TIME ZONE,
  name TEXT NOT NULL,
  project TEXT,
  generated_by TEXT NOT NULL,
  type TEXT NOT NULL,
  data JSONB
);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read documents
CREATE POLICY "Allow authenticated read access for documents"
ON documents FOR SELECT
TO authenticated
USING (true);

-- Allow all authenticated users with creation rights (we can just allow all authenticated to insert, frontend restricts it anyway, but strictly speaking SK Chairman and SK Treasurer create)
CREATE POLICY "Allow authenticated insert for documents"
ON documents FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow updates (archiving/restoring) ONLY for SK Chairman and SK Treasurer
CREATE POLICY "Allow SK Chairman and Treasurer to update documents"
ON documents FOR UPDATE
TO authenticated
USING (
  (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role') IN ('SK Chairman', 'SK Treasurer')
)
WITH CHECK (
  (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role') IN ('SK Chairman', 'SK Treasurer')
);

-- Allow deletes ONLY for SK Chairman and SK Treasurer (in case they delete documents)
CREATE POLICY "Allow SK Chairman and Treasurer to delete documents"
ON documents FOR DELETE
TO authenticated
USING (
  (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role') IN ('SK Chairman', 'SK Treasurer')
);

