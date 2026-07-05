-- ================================================================
-- Add data column to documents table
-- ================================================================

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS data JSONB;
