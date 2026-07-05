-- ================================================================
-- Cuenta: Hard Reset User Data
-- ================================================================
-- WARNING: This script will delete ALL user-entered data, including 
-- budgets, requests, expenses, documents, photos, and audit logs.
-- It will NOT delete user accounts or system schemas.

DO $$ BEGIN DELETE FROM expenses; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM budgets; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM requests; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM projects; EXCEPTION WHEN undefined_table THEN null; END $$;

-- 2. Delete data from documents and reports
DO $$ BEGIN DELETE FROM documents; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM document_counters; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM report_summaries; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM project_photos; EXCEPTION WHEN undefined_table THEN null; END $$;

-- 3. Delete system logs
DO $$ BEGIN DELETE FROM audit_trail; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM restore_history; EXCEPTION WHEN undefined_table THEN null; END $$;
DO $$ BEGIN DELETE FROM backups; EXCEPTION WHEN undefined_table THEN null; END $$;

-- 4. Clear storage bucket objects (Removes the actual photos/receipts)
-- (Skipped in SQL due to Supabase trigger protection; must be done via Dashboard UI or API if desired)

-- Done. All test data has been successfully wiped.
