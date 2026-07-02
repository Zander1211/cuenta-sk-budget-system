-- ================================================================
-- Cuenta: Hard Reset User Data
-- ================================================================
-- WARNING: This script will delete ALL user-entered data, including 
-- budgets, requests, expenses, documents, and audit logs.
-- It will NOT delete user accounts or system schemas.

-- 1. Delete data from main operational tables
DELETE FROM expenses;
DELETE FROM requests;
DELETE FROM budgets;
DELETE FROM projects;

-- 2. Delete data from documents and reports
DELETE FROM documents;
DELETE FROM document_counters;
DELETE FROM report_summaries;

-- 3. Delete system logs
DELETE FROM audit_trail;
DELETE FROM backups;
DELETE FROM restore_history;

-- 4. If there are any other specific tables (like photos or notifications) that exist:
-- DELETE FROM notifications;
-- DELETE FROM photos;

-- Reset complete.
