-- Document counters table for auto-generating PR/PO numbers
-- Run this migration in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.document_counters (
  id text PRIMARY KEY,               -- e.g. 'pr_counter'
  last_number integer NOT NULL DEFAULT 0,
  year integer NOT NULL DEFAULT 2026
);

-- Seed the initial counter row
INSERT INTO public.document_counters (id, last_number, year)
VALUES ('pr_counter', 0, 2026)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read and update the counter
CREATE POLICY "Allow authenticated read" ON public.document_counters
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated update" ON public.document_counters
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON public.document_counters
  FOR INSERT TO authenticated WITH CHECK (true);
