-- Complete the metadata needed to track generated documents. Browser-native
-- Print / Save as PDF does not expose the resulting PDF bytes, so file_path and
-- storage_url remain nullable until a generator supplies an uploaded PDF.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS related_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS related_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS storage_url TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'generated';

UPDATE public.documents
SET
  file_name = COALESCE(
    file_name,
    TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(name), '[^a-z0-9._-]+', '-', 'g')) || '.pdf'
  ),
  status = CASE WHEN archived_at IS NULL THEN 'generated' ELSE 'archived' END
WHERE file_name IS NULL OR status IS NULL OR status NOT IN ('generated', 'archived');

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_status_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_status_check CHECK (status IN ('generated', 'archived'));

CREATE OR REPLACE FUNCTION public.sync_document_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.status := CASE WHEN NEW.archived_at IS NULL THEN 'generated' ELSE 'archived' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_document_status_trigger ON public.documents;
CREATE TRIGGER sync_document_status_trigger
  BEFORE INSERT OR UPDATE OF archived_at ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_document_status();

CREATE INDEX IF NOT EXISTS documents_created_by_idx ON public.documents (created_by);
CREATE INDEX IF NOT EXISTS documents_date_generated_idx ON public.documents (date_generated DESC);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Documents are shared records within this authenticated SK workspace. Existing
-- rows are intentionally preserved and remain visible to every signed-in role.
DROP POLICY IF EXISTS "Allow authenticated read access for documents" ON public.documents;
CREATE POLICY "Allow authenticated read access for documents"
  ON public.documents FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert for documents" ON public.documents;
CREATE POLICY "Allow authenticated insert for documents"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Allow SK Chairman and Treasurer to update documents" ON public.documents;
CREATE POLICY "Allow SK Chairman and Treasurer to update documents"
  ON public.documents FOR UPDATE TO authenticated
  USING (
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  )
  WITH CHECK (
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('SK Chairman', 'SK Treasurer')
  );
