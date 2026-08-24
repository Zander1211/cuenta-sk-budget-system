-- ================================================================
-- Cuenta: Reset Database Data (Non-User Tables Only)
-- ================================================================
-- WARNING: This script deletes ALL operational data including budgets,
-- expenses, projects, events, documents, receipts, audit logs, etc.
--
-- SAFE: Does NOT touch auth.users, profiles, member_biodata,
--       verification_codes, or any user account / identity tables.
--
-- Run this in the Supabase Dashboard → SQL Editor.
-- ================================================================

-- ── Step 1: Child tables first (FK-safe reverse dependency order) ──

-- Recorded expense lines that belong to an approved Project/Event parent
DO $$ BEGIN
  DELETE FROM public.expenses WHERE is_additional = true;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN undefined_column THEN
           -- is_additional column missing; skip this targeted step
           NULL;
END $$;

-- Project photos
DO $$ BEGIN DELETE FROM public.project_photos; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Receipt records
DO $$ BEGIN DELETE FROM public.receipt_records; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Report summaries
DO $$ BEGIN DELETE FROM public.report_summaries; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── Step 2: Core operational tables ───────────────────────────────

-- Remaining expenses (approved Project/Event/Payroll parent rows)
DO $$ BEGIN DELETE FROM public.expenses; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Budget requests
DO $$ BEGIN DELETE FROM public.budget_requests; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Budgets (allocation history)
DO $$ BEGIN DELETE FROM public.budgets; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Projects (if stored separately from expenses)
DO $$ BEGIN DELETE FROM public.projects; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── Step 3: Documents and counters ────────────────────────────────

-- Documents
DO $$ BEGIN DELETE FROM public.documents; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Reset document serial counter back to zero
DO $$ BEGIN
  UPDATE public.document_counters SET last_number = 0;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── Step 4: System logs, history, AI chat, and notifications ──────

-- Chat history (AI conversations)
DO $$ BEGIN DELETE FROM public.chat_history; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Audit trail
DO $$ BEGIN DELETE FROM public.audit_trail; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Backup and restore history
DO $$ BEGIN DELETE FROM public.restore_history; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.backups; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Notifications
DO $$ BEGIN DELETE FROM public.notifications; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── Done ──────────────────────────────────────────────────────────
-- All operational data has been cleared.
-- Users (auth.users, profiles, member_biodata) are untouched.