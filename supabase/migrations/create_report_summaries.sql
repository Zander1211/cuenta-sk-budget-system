-- Migration: create report_summaries table
-- Run this in Supabase SQL editor or via supabase migrations
CREATE TABLE IF NOT EXISTS public.report_summaries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id text NOT NULL,
  model text NOT NULL,
  summary text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, model)
);
