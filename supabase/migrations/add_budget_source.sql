-- ================================================================
-- Cuenta: Add Source to Budgets Table
-- ================================================================

ALTER TABLE budgets ADD COLUMN IF NOT EXISTS source TEXT;
