-- ================================================================
-- Cuenta: Add Receipt Columns to Expenses Table
-- ================================================================

ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS receipt_url TEXT,
ADD COLUMN IF NOT EXISTS receipt_name TEXT;
