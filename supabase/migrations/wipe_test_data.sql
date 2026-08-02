-- ================================================================
-- Cuenta: Hard Reset User Data
-- ================================================================
-- WARNING: This script will delete ALL user-entered and sample data, including
-- budgets, requests, expenses, documents, photos, receipts, and audit logs.
-- It will NOT delete user accounts or system schemas.

-- 1. Operational tables
DO $$ BEGIN DELETE FROM expenses; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM requests; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM budget_requests; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM budgets; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM projects; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM project_photos; EXCEPTION WHEN undefined_table THEN null; END $$;

-- 2. Documents, reports, and receipts
DO $$ BEGIN DELETE FROM documents; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM report_summaries; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM receipt_records; EXCEPTION WHEN undefined_table THEN null; END $$;

-- Reset document counter to zero
DO $$ BEGIN
  UPDATE document_counters SET last_number = 0;
EXCEPTION WHEN undefined_table THEN null; END $$;

-- 3. System logs, history, and AI chat
DO $$ BEGIN DELETE FROM chat_history; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM audit_trail; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM restore_history; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM backups; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM notifications; EXCEPTION WHEN undefined_table THEN null; END $$;

-- Done. All operational test/user data has been successfully wiped.
