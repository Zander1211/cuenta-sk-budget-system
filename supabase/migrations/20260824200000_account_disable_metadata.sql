-- Migration: Add disable metadata columns to created_accounts
-- Adds disabled_at (timestamp) and disabled_by (admin user id) so the
-- Disabled Accounts table can show who disabled an account and when.
-- Uses IF NOT EXISTS guards so it is safe to run more than once.

ALTER TABLE public.created_accounts
  ADD COLUMN IF NOT EXISTS disabled_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disabled_by  UUID        DEFAULT NULL;

-- Index for fast filtering of disabled accounts
CREATE INDEX IF NOT EXISTS idx_created_accounts_is_active
  ON public.created_accounts (is_active);
