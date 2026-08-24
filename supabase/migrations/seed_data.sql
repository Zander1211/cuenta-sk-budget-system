-- ================================================================
-- Cuenta: Seed Data for the SK Financial System
-- ================================================================
-- Populates all operational tables with realistic demo data for a
-- Sangguniang Kabataan (SK) barangay unit.
--
-- SAFE:  Does NOT create auth.users rows — it links to the real ones.
--        Every section is wrapped in an exception-safe DO block, so the
--        script skips any table that does not yet exist.
--
-- RE-RUNNABLE:  Section 0 removes only the rows this seed created
--        (matched on its own fixed UUIDs), so running it twice does not
--        duplicate data and never touches records you entered yourself.
--
-- ----------------------------------------------------------------
-- IMPORTANT — why expense IDs are not written literally here
-- ----------------------------------------------------------------
-- public.expenses.id is BIGINT in this deployment (older Cuenta
-- environments use BIGINT; an early draft assumed UUID — see
-- 20260822200000_project_event_recorded_expenses.sql). Writing a UUID
-- literal into it fails with:
--     invalid input syntax for type bigint
-- So expense rows let the database generate their own IDs, and this
-- script captures them with RETURNING ... INTO. The variables are
-- declared as %TYPE, so this file works unchanged whether the deployed
-- expenses.id is BIGINT or UUID.
--
-- ----------------------------------------------------------------
-- User mapping (from auth.users)
-- ----------------------------------------------------------------
--   SK Chairman     : James Zander Yu    — 80d255a8-ef5a-45de-a360-ee5e6be61474
--   SK Treasurer    : Angel Faith Ogatis — 626d4acd-da6a-4dc9-957f-c5fa8525ed98
--   SK Kagawad      : Vince Villar       — 16257f00-adff-4f11-abe7-fd3f5f6ef065
--   Barangay Treas. : Doris Ann Mariano  — 51cb7ed7-589f-4ae0-879b-67493b10ce19
--   SK Kagawad      : Dave Aldrine       — 7944b776-e980-4989-82a6-8557da4a3eaf
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE 'Cuenta seed: starting. Expense IDs are database-generated.';
END $$;


-- ================================================================
-- 0. CLEAN UP A PREVIOUS RUN OF THIS SEED
-- ================================================================
-- Scoped strictly to this seed's own fixed IDs. Requisition rows are
-- removed automatically by the ON DELETE CASCADE on parent_project_id.
-- ================================================================
DO $$ BEGIN
  DELETE FROM public.receipt_records WHERE id IN (
    'ce000001-0000-0000-0000-000000000001','ce000002-0000-0000-0000-000000000002',
    'ce000003-0000-0000-0000-000000000003','ce000004-0000-0000-0000-000000000004',
    'ce000005-0000-0000-0000-000000000005','ce000006-0000-0000-0000-000000000006',
    'ce000007-0000-0000-0000-000000000007','ce000008-0000-0000-0000-000000000008',
    'ce000009-0000-0000-0000-000000000009','ce00000a-0000-0000-0000-00000000000a'
  );
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DELETE FROM public.expenses WHERE request_id IN (
    'a1a1a1a1-0001-0001-0001-000000000001','b2b2b2b2-0002-0002-0002-000000000002',
    'c3c3c3c3-0003-0003-0003-000000000003','d4d4d4d4-0004-0004-0004-000000000004',
    'e5e5e5e5-0005-0005-0005-000000000005'
  );
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DELETE FROM public.budget_requests WHERE id IN (
    'a1a1a1a1-0001-0001-0001-000000000001','b2b2b2b2-0002-0002-0002-000000000002',
    'c3c3c3c3-0003-0003-0003-000000000003','d4d4d4d4-0004-0004-0004-000000000004',
    'e5e5e5e5-0005-0005-0005-000000000005','f6f6f6f6-0006-0006-0006-000000000006',
    'a7a7a7a7-0007-0007-0007-000000000007'
  );
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DELETE FROM public.budgets WHERE id IN (
    'bd260001-0000-0000-0000-000000000001','bd260002-0000-0000-0000-000000000002',
    'bd260003-0000-0000-0000-000000000003','bd260004-0000-0000-0000-000000000004',
    'bd260005-0000-0000-0000-000000000005','bd260006-0000-0000-0000-000000000006',
    'bd260007-0000-0000-0000-000000000007','bd260008-0000-0000-0000-000000000008',
    'bd260009-0000-0000-0000-000000000009','bd26000a-0000-0000-0000-00000000000a'
  );
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DELETE FROM public.documents WHERE id IN (
    'd0c00001-0000-0000-0000-000000000001','d0c00002-0000-0000-0000-000000000002',
    'd0c00003-0000-0000-0000-000000000003','d0c00004-0000-0000-0000-000000000004',
    'd0c00005-0000-0000-0000-000000000005'
  );
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DELETE FROM public.audit_trail WHERE id IN (
    'a0d10001-0000-0000-0000-000000000001','a0d10002-0000-0000-0000-000000000002',
    'a0d10003-0000-0000-0000-000000000003','a0d10004-0000-0000-0000-000000000004',
    'a0d10005-0000-0000-0000-000000000005','a0d10006-0000-0000-0000-000000000006',
    'a0d10007-0000-0000-0000-000000000007','a0d10008-0000-0000-0000-000000000008',
    'a0d10009-0000-0000-0000-000000000009','a0d1000a-0000-0000-0000-00000000000a',
    'a0d1000b-0000-0000-0000-00000000000b','a0d1000c-0000-0000-0000-00000000000c',
    'a0d1000d-0000-0000-0000-00000000000d','a0d1000e-0000-0000-0000-00000000000e'
  );
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DELETE FROM public.notifications WHERE id IN (
    'bf000001-0000-0000-0000-000000000001','bf000002-0000-0000-0000-000000000002',
    'bf000003-0000-0000-0000-000000000003','bf000004-0000-0000-0000-000000000004',
    'bf000005-0000-0000-0000-000000000005'
  );
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DELETE FROM public.chat_history WHERE id IN (
    'cb000001-0000-0000-0000-000000000001','cb000002-0000-0000-0000-000000000002',
    'cb000003-0000-0000-0000-000000000003','cb000004-0000-0000-0000-000000000004',
    'cb000005-0000-0000-0000-000000000005','cb000006-0000-0000-0000-000000000006'
  );
EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- ================================================================
-- 1. DOCUMENT COUNTERS
-- ================================================================
-- Three Purchase Requests are generated below, so the counter sits at 3.
-- ================================================================
DO $$ BEGIN
  INSERT INTO public.document_counters (id, last_number, year)
  VALUES ('pr_counter', 3, 2026)
  ON CONFLICT (id) DO UPDATE
    SET last_number = EXCLUDED.last_number,
        year        = EXCLUDED.year;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping document_counters — table does not exist.';
END $$;


-- ================================================================
-- 2. BUDGETS  (monthly allocations — append-only)
-- ================================================================
-- Must be inserted BEFORE budget_requests: the
-- enforce_budget_request_capacity trigger rejects any Pending/Approved
-- request whose event month has no budget row.
--
--   Q1 = 135,000    Q2 = 165,000    Q3 = 165,000    Total = 465,000
-- ================================================================
DO $$ BEGIN
  INSERT INTO public.budgets (id, month, quarter, year, amount, source, created_at)
  VALUES
    -- Q1
    ('bd260001-0000-0000-0000-000000000001', 1, 1, 2026, 45000.00, 'DILG Allocation',  '2026-01-03 08:00:00+08'),
    ('bd260002-0000-0000-0000-000000000002', 2, 1, 2026, 45000.00, 'DILG Allocation',  '2026-02-03 08:00:00+08'),
    ('bd260003-0000-0000-0000-000000000003', 3, 1, 2026, 45000.00, 'DILG Allocation',  '2026-03-03 08:00:00+08'),
    -- Q2
    ('bd260004-0000-0000-0000-000000000004', 4, 2, 2026, 50000.00, 'DILG Allocation',  '2026-04-02 08:00:00+08'),
    ('bd260005-0000-0000-0000-000000000005', 5, 2, 2026, 50000.00, 'DILG Allocation',  '2026-05-02 08:00:00+08'),
    ('bd260006-0000-0000-0000-000000000006', 6, 2, 2026, 50000.00, 'DILG Allocation',  '2026-06-02 08:00:00+08'),
    -- Mid-year supplemental — demonstrates two allocations in one month
    ('bd260007-0000-0000-0000-000000000007', 6, 2, 2026, 15000.00, 'Barangay Subsidy', '2026-06-15 10:30:00+08'),
    -- Q3
    ('bd260008-0000-0000-0000-000000000008', 7, 3, 2026, 55000.00, 'DILG Allocation',  '2026-07-02 08:00:00+08'),
    ('bd260009-0000-0000-0000-000000000009', 8, 3, 2026, 55000.00, 'DILG Allocation',  '2026-08-04 08:00:00+08'),
    ('bd26000a-0000-0000-0000-00000000000a', 9, 3, 2026, 55000.00, 'DILG Allocation',  '2026-09-02 08:00:00+08')
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping budgets — table does not exist.';
         WHEN undefined_column THEN
  RAISE NOTICE 'Skipping budgets — columns missing (run pending migrations first).';
END $$;


-- ================================================================
-- 3. BUDGET REQUESTS  (5 Approved, 1 Pending, 1 Rejected)
-- ================================================================
-- Monthly commitments stay inside their allocation:
--   Mar 28,500 / 45,000    May 35,000 / 50,000    Jun 40,000 / 65,000
--   Jul 12,000 / 55,000    Sep  9,500 / 55,000
-- The Rejected request (Oct) is exempt from the capacity trigger.
-- ================================================================

-- A: Linggo ng Kabataan (Approved / Completed)
DO $$ BEGIN
  INSERT INTO public.budget_requests (
    id, type, event, category, amount, approved_amount, event_date, venue,
    description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, status, project_status,
    submitted_at, approved_at, created_at, updated_at
  ) VALUES (
    'a1a1a1a1-0001-0001-0001-000000000001',
    'Event', 'Linggo ng Kabataan 2026', 'Programs & Events', 28500.00, 28500.00,
    '2026-03-22', 'Barangay Covered Court, Brgy. San Jose',
    'Annual Linggo ng Kabataan celebration with sports, cultural presentations, and recognition of outstanding youth.',
    'Coordinate with barangay captain for venue. Secure sound system sponsor.',
    '[
      {"item":"Sound System Rental","quantity":1,"unit":"set","unitCost":8000,"total":8000},
      {"item":"Tarpaulin / Streamers","quantity":5,"unit":"pcs","unitCost":300,"total":1500},
      {"item":"Snacks for Participants","quantity":200,"unit":"pax","unitCost":60,"total":12000},
      {"item":"Prizes and Certificates","quantity":1,"unit":"lot","unitCost":4000,"total":4000},
      {"item":"Contingency","quantity":1,"unit":"lot","unitCost":3000,"total":3000}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    'Approved', 'Completed',
    '2026-03-10 09:00:00+08', '2026-03-12 14:00:00+08',
    '2026-03-10 09:00:00+08', '2026-03-25 17:00:00+08'
  ) ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping budget_requests (A) — table does not exist.';
END $$;

-- B: Youth Skills Training (Approved / Ongoing)
DO $$ BEGIN
  INSERT INTO public.budget_requests (
    id, type, event, category, amount, approved_amount, event_date, venue,
    description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, status, project_status,
    submitted_at, approved_at, created_at, updated_at
  ) VALUES (
    'b2b2b2b2-0002-0002-0002-000000000002',
    'Project', 'Youth Skills Training — Basic Electronics', 'Livelihood & Skills', 35000.00, 35000.00,
    '2026-05-10', 'SK Hall, Brgy. San Jose',
    '3-day skills training on basic electronics repair for out-of-school youth aged 15–30.',
    'Trainer from TESDA confirmed. Materials procurement to be done by May 5.',
    '[
      {"item":"Training Materials (tools & components)","quantity":30,"unit":"kits","unitCost":600,"total":18000},
      {"item":"TESDA Trainer Fee","quantity":3,"unit":"days","unitCost":3500,"total":10500},
      {"item":"Meals for Participants","quantity":90,"unit":"pax","unitCost":55,"total":4950},
      {"item":"Certificates & ID Lanyards","quantity":30,"unit":"pcs","unitCost":50,"total":1500}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    'Approved', 'Ongoing',
    '2026-04-28 10:00:00+08', '2026-04-30 09:30:00+08',
    '2026-04-28 10:00:00+08', '2026-05-12 16:00:00+08'
  ) ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping budget_requests (B) — table does not exist.';
END $$;

-- C: Basketball League (Approved / Completed)
DO $$ BEGIN
  INSERT INTO public.budget_requests (
    id, type, event, category, amount, approved_amount, event_date, venue,
    description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, status, project_status,
    submitted_at, approved_at, created_at, updated_at
  ) VALUES (
    'c3c3c3c3-0003-0003-0003-000000000003',
    'Event', 'SK Barangay Basketball League — Summer 2026', 'Sports & Recreation', 22000.00, 22000.00,
    '2026-06-01', 'Barangay Basketball Court, Brgy. San Jose',
    'Inter-purok basketball tournament for youth 18–30 years old. 8 teams, single elimination.',
    'Referees already confirmed. Medals and trophies to be ordered from supplier.',
    '[
      {"item":"Basketball (Game ball)","quantity":4,"unit":"pcs","unitCost":800,"total":3200},
      {"item":"Medals (Gold, Silver, Bronze sets)","quantity":3,"unit":"sets","unitCost":1500,"total":4500},
      {"item":"Trophies","quantity":3,"unit":"pcs","unitCost":1200,"total":3600},
      {"item":"Referee Fee","quantity":10,"unit":"games","unitCost":500,"total":5000},
      {"item":"Tarpaulin","quantity":3,"unit":"pcs","unitCost":400,"total":1200},
      {"item":"Water & Snacks for Volunteers","quantity":1,"unit":"lot","unitCost":4500,"total":4500}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    'Approved', 'Completed',
    '2026-05-20 09:00:00+08', '2026-05-22 11:00:00+08',
    '2026-05-20 09:00:00+08', '2026-06-18 12:00:00+08'
  ) ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping budget_requests (C) — table does not exist.';
END $$;

-- D: June Payroll (Approved / Completed)
DO $$ BEGIN
  INSERT INTO public.budget_requests (
    id, type, event, category, amount, approved_amount, event_date, venue,
    description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, status, project_status,
    submitted_at, approved_at, created_at, updated_at
  ) VALUES (
    'd4d4d4d4-0004-0004-0004-000000000004',
    'Payroll', 'SK Officers Honoraria — June 2026', 'Personnel Services', 18000.00, 18000.00,
    '2026-06-30', 'SK Office, Brgy. San Jose',
    'Monthly honoraria for SK officials as provided under RA 10742 (SK Reform Act).',
    NULL,
    '[
      {"item":"SK Chairman Honoraria","quantity":1,"unit":"mo","unitCost":2000,"total":2000},
      {"item":"SK Secretary Honoraria","quantity":1,"unit":"mo","unitCost":1500,"total":1500},
      {"item":"SK Treasurer Honoraria","quantity":1,"unit":"mo","unitCost":1500,"total":1500},
      {"item":"SK Kagawad Honoraria (8 members)","quantity":8,"unit":"mo","unitCost":1625,"total":13000}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    'Approved', 'Completed',
    '2026-06-25 09:00:00+08', '2026-06-26 10:00:00+08',
    '2026-06-25 09:00:00+08', '2026-06-30 15:00:00+08'
  ) ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping budget_requests (D) — table does not exist.';
END $$;

-- E: Clean-Up Drive (Approved / Ongoing)
DO $$ BEGIN
  INSERT INTO public.budget_requests (
    id, type, event, category, amount, approved_amount, event_date, venue,
    description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, status, project_status,
    submitted_at, approved_at, created_at, updated_at
  ) VALUES (
    'e5e5e5e5-0005-0005-0005-000000000005',
    'Project', 'Barangay Clean-Up Drive & Tree Planting 2026', 'Environment', 12000.00, 12000.00,
    '2026-07-20', 'Brgy. San Jose Main Road & Estero Area',
    'Monthly clean-up drive combined with tree planting along the estero. Targets 200 youth volunteers.',
    'Coordinate with MENRO for seedlings. Garbage bags from LGU.',
    '[
      {"item":"Garbage Bags (heavy duty)","quantity":10,"unit":"rolls","unitCost":200,"total":2000},
      {"item":"Seedlings (mahogany/narra)","quantity":100,"unit":"pcs","unitCost":35,"total":3500},
      {"item":"Garden Tools (shovels, rakes)","quantity":10,"unit":"pcs","unitCost":350,"total":3500},
      {"item":"Snacks for Volunteers","quantity":200,"unit":"pax","unitCost":15,"total":3000}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    'Approved', 'Ongoing',
    '2026-07-10 09:30:00+08', '2026-07-12 11:00:00+08',
    '2026-07-10 09:30:00+08', '2026-07-25 11:00:00+08'
  ) ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping budget_requests (E) — table does not exist.';
END $$;

-- F: Anti-Drug Awareness Seminar (Pending — awaiting Chairman review)
DO $$ BEGIN
  INSERT INTO public.budget_requests (
    id, type, event, category, amount, event_date, venue,
    description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, status, project_status,
    submitted_at, created_at, updated_at
  ) VALUES (
    'f6f6f6f6-0006-0006-0006-000000000006',
    'Event', 'Anti-Drug Awareness Seminar for Youth', 'Health & Social Services', 9500.00,
    '2026-09-05', 'Barangay Multi-Purpose Hall, Brgy. San Jose',
    'Half-day seminar on anti-drug awareness in partnership with PDEA and BHERT. Target: 150 youth.',
    'PDEA speaker confirmed. Venue permit needed from barangay captain.',
    '[
      {"item":"AVP / Projector Rental","quantity":1,"unit":"day","unitCost":1500,"total":1500},
      {"item":"Printed Handouts","quantity":150,"unit":"pcs","unitCost":10,"total":1500},
      {"item":"Snacks for Participants","quantity":150,"unit":"pax","unitCost":40,"total":6000},
      {"item":"Certificate Printing","quantity":150,"unit":"pcs","unitCost":3,"total":500}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    'Pending', 'Pending',
    '2026-08-22 10:00:00+08',
    '2026-08-22 10:00:00+08', '2026-08-22 10:00:00+08'
  ) ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping budget_requests (F) — table does not exist.';
END $$;

-- G: Leadership Camp (Rejected — exempt from the capacity trigger)
DO $$ BEGIN
  INSERT INTO public.budget_requests (
    id, type, event, category, amount, event_date, venue,
    description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, status, project_status,
    submitted_at, rejected_at, rejection_reason,
    revision_history, created_at, updated_at
  ) VALUES (
    'a7a7a7a7-0007-0007-0007-000000000007',
    'Event', 'SK Youth Leadership Camp 2026', 'Leadership & Governance', 65000.00,
    '2026-10-15', 'Camp Claraville, Tagaytay City',
    '3-day youth leadership camp for 50 SK officers and youth leaders.',
    'Transportation and accommodation included in package rate.',
    '[
      {"item":"Package Rate (accommodation + meals + venue)","quantity":50,"unit":"pax","unitCost":900,"total":45000},
      {"item":"Transportation (bus rental)","quantity":2,"unit":"trips","unitCost":8000,"total":16000},
      {"item":"Training Materials","quantity":50,"unit":"kits","unitCost":80,"total":4000}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    'Rejected', 'Pending',
    '2026-08-15 09:00:00+08',
    '2026-08-17 14:00:00+08',
    'Budget exceeds the available Q4 allocation. Please reduce scope to an in-barangay venue or split the camp across two quarters. Out-of-town accommodation is not covered under current guidelines.',
    '[{"date":"2026-08-17T06:00:00.000Z","action":"Rejected","reason":"Budget exceeds the available Q4 allocation.","by":"James Zander Yu — SK Chairman"}]'::jsonb,
    '2026-08-15 09:00:00+08', '2026-08-17 14:00:00+08'
  ) ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping budget_requests (G) — table does not exist.';
END $$;


-- ================================================================
-- 4. EXPENSES — approved allocations + their requisitions
-- ================================================================
-- Parent rows (is_additional = false) mirror an approved request and
-- carry the APPROVED BUDGET. Requisitions (is_additional = true) are
-- the ACTUAL money spent, and must carry a non-zero amount: the app
-- drops any actual-expense row whose amount is 0
-- (see src/utils/projectEventFinancials.js).
--
-- IDs are generated by the database and captured below, because
-- expenses.id is BIGINT in this deployment.
--
--   Project / Event         Approved     Recorded    Remaining
--   Linggo ng Kabataan      28,500       25,500       3,000
--   Skills Training         35,000       18,000      17,000   (ongoing)
--   Basketball League       22,000       22,000           0
--   June Honoraria          18,000       18,000           0
--   Clean-Up Drive          12,000        5,500       6,500   (ongoing)
--   TOTAL                  115,500       89,000      26,500
-- ================================================================
DO $$
DECLARE
  -- %TYPE keeps this script correct whether expenses.id is BIGINT or UUID.
  v_exp_a  public.expenses.id%TYPE;   -- Linggo ng Kabataan
  v_exp_b  public.expenses.id%TYPE;   -- Skills Training
  v_exp_c  public.expenses.id%TYPE;   -- Basketball League
  v_exp_d  public.expenses.id%TYPE;   -- June Honoraria
  v_exp_e  public.expenses.id%TYPE;   -- Clean-Up Drive

  v_req_a1 public.expenses.id%TYPE;
  v_req_a2 public.expenses.id%TYPE;
  v_req_a3 public.expenses.id%TYPE;
  v_req_b1 public.expenses.id%TYPE;
  v_req_c1 public.expenses.id%TYPE;
  v_req_c2 public.expenses.id%TYPE;
  v_req_c3 public.expenses.id%TYPE;
  v_req_d1 public.expenses.id%TYPE;
  v_req_e1 public.expenses.id%TYPE;
BEGIN

  -- ---------- Parent A: Linggo ng Kabataan (Completed) ----------
  INSERT INTO public.expenses (
    request_id, event, project, category, type,
    amount, requested_budget, approved_budget,
    status, project_status, approved_at, date, event_date,
    month, year, venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, created_at, updated_at
  ) VALUES (
    'a1a1a1a1-0001-0001-0001-000000000001',
    'Linggo ng Kabataan 2026', 'Linggo ng Kabataan 2026',
    'Programs & Events', 'Event',
    28500.00, 28500.00, 28500.00,
    'Approved', 'Completed',
    '2026-03-12 14:00:00+08', '2026-03-22', '2026-03-22',
    3, 2026,
    'Barangay Covered Court, Brgy. San Jose',
    'Annual Linggo ng Kabataan celebration with sports, cultural presentations, and recognition of outstanding youth.',
    'Venue cleared with the barangay captain.',
    '[
      {"item":"Sound System Rental","quantity":1,"unit":"set","unitCost":8000,"total":8000},
      {"item":"Tarpaulin / Streamers","quantity":5,"unit":"pcs","unitCost":300,"total":1500},
      {"item":"Snacks for Participants","quantity":200,"unit":"pax","unitCost":60,"total":12000},
      {"item":"Prizes and Certificates","quantity":1,"unit":"lot","unitCost":4000,"total":4000},
      {"item":"Contingency","quantity":1,"unit":"lot","unitCost":3000,"total":3000}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    false,
    '2026-03-12 14:00:00+08', '2026-03-25 17:00:00+08'
  ) RETURNING id INTO v_exp_a;

  -- ---------- Parent B: Youth Skills Training (Ongoing) ----------
  INSERT INTO public.expenses (
    request_id, event, project, category, type,
    amount, requested_budget, approved_budget,
    status, project_status, approved_at, date, event_date,
    month, year, venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, created_at, updated_at
  ) VALUES (
    'b2b2b2b2-0002-0002-0002-000000000002',
    'Youth Skills Training — Basic Electronics', 'Youth Skills Training — Basic Electronics',
    'Livelihood & Skills', 'Project',
    35000.00, 35000.00, 35000.00,
    'Approved', 'Ongoing',
    '2026-04-30 09:30:00+08', '2026-05-10', '2026-05-10',
    5, 2026,
    'SK Hall, Brgy. San Jose',
    '3-day skills training on basic electronics repair for out-of-school youth aged 15–30.',
    'TESDA trainer confirmed. Second batch scheduled for Q4.',
    '[
      {"item":"Training Materials (tools & components)","quantity":30,"unit":"kits","unitCost":600,"total":18000},
      {"item":"TESDA Trainer Fee","quantity":3,"unit":"days","unitCost":3500,"total":10500},
      {"item":"Meals for Participants","quantity":90,"unit":"pax","unitCost":55,"total":4950},
      {"item":"Certificates & ID Lanyards","quantity":30,"unit":"pcs","unitCost":50,"total":1500}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    false,
    '2026-04-30 09:30:00+08', '2026-05-12 16:00:00+08'
  ) RETURNING id INTO v_exp_b;

  -- ---------- Parent C: Basketball League (Completed) ----------
  INSERT INTO public.expenses (
    request_id, event, project, category, type,
    amount, requested_budget, approved_budget,
    status, project_status, approved_at, date, event_date,
    month, year, venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, created_at, updated_at
  ) VALUES (
    'c3c3c3c3-0003-0003-0003-000000000003',
    'SK Barangay Basketball League — Summer 2026', 'SK Barangay Basketball League — Summer 2026',
    'Sports & Recreation', 'Event',
    22000.00, 22000.00, 22000.00,
    'Approved', 'Completed',
    '2026-05-22 11:00:00+08', '2026-06-01', '2026-06-01',
    6, 2026,
    'Barangay Basketball Court, Brgy. San Jose',
    'Inter-purok basketball tournament for youth 18–30 years old. 8 teams, single elimination.',
    'Champion: Purok 4. Full allocation utilised.',
    '[
      {"item":"Basketball (Game ball)","quantity":4,"unit":"pcs","unitCost":800,"total":3200},
      {"item":"Medals (Gold, Silver, Bronze sets)","quantity":3,"unit":"sets","unitCost":1500,"total":4500},
      {"item":"Trophies","quantity":3,"unit":"pcs","unitCost":1200,"total":3600},
      {"item":"Referee Fee","quantity":10,"unit":"games","unitCost":500,"total":5000},
      {"item":"Tarpaulin","quantity":3,"unit":"pcs","unitCost":400,"total":1200},
      {"item":"Water & Snacks for Volunteers","quantity":1,"unit":"lot","unitCost":4500,"total":4500}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    false,
    '2026-05-22 11:00:00+08', '2026-06-18 12:00:00+08'
  ) RETURNING id INTO v_exp_c;

  -- ---------- Parent D: June Honoraria (Completed) ----------
  INSERT INTO public.expenses (
    request_id, event, project, category, type,
    amount, requested_budget, approved_budget,
    status, project_status, approved_at, date, event_date,
    month, year, venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, created_at, updated_at
  ) VALUES (
    'd4d4d4d4-0004-0004-0004-000000000004',
    'SK Officers Honoraria — June 2026', 'SK Officers Honoraria — June 2026',
    'Personnel Services', 'Payroll',
    18000.00, 18000.00, 18000.00,
    'Approved', 'Completed',
    '2026-06-26 10:00:00+08', '2026-06-30', '2026-06-30',
    6, 2026,
    'SK Office, Brgy. San Jose',
    'Monthly honoraria for SK officials as provided under RA 10742 (SK Reform Act).',
    NULL,
    '[
      {"item":"SK Chairman Honoraria","quantity":1,"unit":"mo","unitCost":2000,"total":2000},
      {"item":"SK Secretary Honoraria","quantity":1,"unit":"mo","unitCost":1500,"total":1500},
      {"item":"SK Treasurer Honoraria","quantity":1,"unit":"mo","unitCost":1500,"total":1500},
      {"item":"SK Kagawad Honoraria (8 members)","quantity":8,"unit":"mo","unitCost":1625,"total":13000}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    false,
    '2026-06-26 10:00:00+08', '2026-06-30 15:00:00+08'
  ) RETURNING id INTO v_exp_d;

  -- ---------- Parent E: Clean-Up Drive (Ongoing) ----------
  INSERT INTO public.expenses (
    request_id, event, project, category, type,
    amount, requested_budget, approved_budget,
    status, project_status, approved_at, date, event_date,
    month, year, venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, created_at, updated_at
  ) VALUES (
    'e5e5e5e5-0005-0005-0005-000000000005',
    'Barangay Clean-Up Drive & Tree Planting 2026', 'Barangay Clean-Up Drive & Tree Planting 2026',
    'Environment', 'Project',
    12000.00, 12000.00, 12000.00,
    'Approved', 'Ongoing',
    '2026-07-12 11:00:00+08', '2026-07-20', '2026-07-20',
    7, 2026,
    'Brgy. San Jose Main Road & Estero Area',
    'Monthly clean-up drive combined with tree planting along the estero. Targets 200 youth volunteers.',
    'MENRO supplied part of the seedlings at no cost.',
    '[
      {"item":"Garbage Bags (heavy duty)","quantity":10,"unit":"rolls","unitCost":200,"total":2000},
      {"item":"Seedlings (mahogany/narra)","quantity":100,"unit":"pcs","unitCost":35,"total":3500},
      {"item":"Garden Tools (shovels, rakes)","quantity":10,"unit":"pcs","unitCost":350,"total":3500},
      {"item":"Snacks for Volunteers","quantity":200,"unit":"pax","unitCost":15,"total":3000}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    false,
    '2026-07-12 11:00:00+08', '2026-07-25 11:00:00+08'
  ) RETURNING id INTO v_exp_e;

  -- ==============================================================
  -- Requisitions — actual money spent against each approved parent.
  -- The validate_expense_requisition_parent trigger clears event /
  -- project, zeroes the budget columns and forces status 'Recorded'.
  -- ==============================================================

  -- A1: Sound system — 8,000
  INSERT INTO public.expenses (
    parent_project_id, category, type, amount,
    project_status, approved_at, date, event_date, month, year,
    venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, remarks, created_at, updated_at
  ) VALUES (
    v_exp_a, 'Programs & Events', 'Event', 8000.00,
    'Completed', '2026-03-12 14:00:00+08', '2026-03-21', '2026-03-22', 3, 2026,
    'Barangay Covered Court, Brgy. San Jose',
    'Sound system rental for Linggo ng Kabataan',
    'OR No. 2026-0312 on file.',
    '[{"item":"Sound System Rental","quantity":1,"unit":"set","unitCost":8000,"total":8000}]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    true, 'Paid to Audio Solutions PH',
    '2026-03-21 10:00:00+08', '2026-03-21 10:00:00+08'
  ) RETURNING id INTO v_req_a1;

  -- A2: Snacks and prizes — 16,000
  INSERT INTO public.expenses (
    parent_project_id, category, type, amount,
    project_status, approved_at, date, event_date, month, year,
    venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, remarks, created_at, updated_at
  ) VALUES (
    v_exp_a, 'Programs & Events', 'Event', 16000.00,
    'Completed', '2026-03-12 14:00:00+08', '2026-03-22', '2026-03-22', 3, 2026,
    'Barangay Covered Court, Brgy. San Jose',
    'Snacks, prizes and certificates for Linggo ng Kabataan',
    'Two receipts filed under this requisition.',
    '[
      {"item":"Snacks for Participants","quantity":200,"unit":"pax","unitCost":60,"total":12000},
      {"item":"Prizes and Certificates","quantity":1,"unit":"lot","unitCost":4000,"total":4000}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    true, 'Paid to SM Supermarket and National Bookstore',
    '2026-03-22 18:00:00+08', '2026-03-22 18:00:00+08'
  ) RETURNING id INTO v_req_a2;

  -- A3: Tarpaulin and streamers — 1,500
  INSERT INTO public.expenses (
    parent_project_id, category, type, amount,
    project_status, approved_at, date, event_date, month, year,
    venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, remarks, created_at, updated_at
  ) VALUES (
    v_exp_a, 'Programs & Events', 'Event', 1500.00,
    'Completed', '2026-03-12 14:00:00+08', '2026-03-19', '2026-03-22', 3, 2026,
    'Barangay Covered Court, Brgy. San Jose',
    'Tarpaulin and streamers for Linggo ng Kabataan',
    'Contingency of ₱3,000.00 was not used and returned as savings.',
    '[{"item":"Tarpaulin / Streamers","quantity":5,"unit":"pcs","unitCost":300,"total":1500}]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    true, 'Paid to Sunrise Digital Printing',
    '2026-03-19 14:00:00+08', '2026-03-19 14:00:00+08'
  ) RETURNING id INTO v_req_a3;

  -- B1: Training materials — 18,000 (project still ongoing)
  INSERT INTO public.expenses (
    parent_project_id, category, type, amount,
    project_status, approved_at, date, event_date, month, year,
    venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, remarks, created_at, updated_at
  ) VALUES (
    v_exp_b, 'Livelihood & Skills', 'Project', 18000.00,
    'Ongoing', '2026-04-30 09:30:00+08', '2026-05-05', '2026-05-10', 5, 2026,
    'SK Hall, Brgy. San Jose',
    'Training materials — 30 basic electronics tool kits',
    'Trainer fee and meals will be liquidated after the second batch.',
    '[{"item":"Training Materials (tools & components)","quantity":30,"unit":"kits","unitCost":600,"total":18000}]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    true, 'Paid to Deeco Electronics Supply',
    '2026-05-05 09:00:00+08', '2026-05-05 09:00:00+08'
  ) RETURNING id INTO v_req_b1;

  -- C1: Sports equipment — 11,300
  INSERT INTO public.expenses (
    parent_project_id, category, type, amount,
    project_status, approved_at, date, event_date, month, year,
    venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, remarks, created_at, updated_at
  ) VALUES (
    v_exp_c, 'Sports & Recreation', 'Event', 11300.00,
    'Completed', '2026-05-22 11:00:00+08', '2026-05-28', '2026-06-01', 5, 2026,
    'Barangay Basketball Court, Brgy. San Jose',
    'Game balls, medals and trophies for the league',
    'Ordered two weeks ahead of opening day.',
    '[
      {"item":"Basketball (Game ball)","quantity":4,"unit":"pcs","unitCost":800,"total":3200},
      {"item":"Medals (Gold, Silver, Bronze sets)","quantity":3,"unit":"sets","unitCost":1500,"total":4500},
      {"item":"Trophies","quantity":3,"unit":"pcs","unitCost":1200,"total":3600}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    true, 'Paid to Toby''s Sports',
    '2026-05-28 09:00:00+08', '2026-05-28 09:00:00+08'
  ) RETURNING id INTO v_req_c1;

  -- C2: Referee fees — 5,000
  INSERT INTO public.expenses (
    parent_project_id, category, type, amount,
    project_status, approved_at, date, event_date, month, year,
    venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, remarks, created_at, updated_at
  ) VALUES (
    v_exp_c, 'Sports & Recreation', 'Event', 5000.00,
    'Completed', '2026-05-22 11:00:00+08', '2026-06-14', '2026-06-01', 6, 2026,
    'Barangay Basketball Court, Brgy. San Jose',
    'Referee fees for 10 league games',
    'Paid after the championship game.',
    '[{"item":"Referee Fee","quantity":10,"unit":"games","unitCost":500,"total":5000}]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    true, 'Paid to accredited barangay referees',
    '2026-06-14 17:00:00+08', '2026-06-14 17:00:00+08'
  ) RETURNING id INTO v_req_c2;

  -- C3: Tarpaulin, water and snacks — 5,700
  INSERT INTO public.expenses (
    parent_project_id, category, type, amount,
    project_status, approved_at, date, event_date, month, year,
    venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, remarks, created_at, updated_at
  ) VALUES (
    v_exp_c, 'Sports & Recreation', 'Event', 5700.00,
    'Completed', '2026-05-22 11:00:00+08', '2026-06-15', '2026-06-01', 6, 2026,
    'Barangay Basketball Court, Brgy. San Jose',
    'Tarpaulins, drinking water and snacks for volunteers',
    'Closes out the league allocation in full.',
    '[
      {"item":"Tarpaulin","quantity":3,"unit":"pcs","unitCost":400,"total":1200},
      {"item":"Water & Snacks for Volunteers","quantity":1,"unit":"lot","unitCost":4500,"total":4500}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    true, 'Paid to Sunrise Digital Printing and Purok 4 Sari-Sari Store',
    '2026-06-15 11:00:00+08', '2026-06-15 11:00:00+08'
  ) RETURNING id INTO v_req_c3;

  -- D1: Honoraria disbursement — 18,000
  INSERT INTO public.expenses (
    parent_project_id, category, type, amount,
    project_status, approved_at, date, event_date, month, year,
    venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, remarks, created_at, updated_at
  ) VALUES (
    v_exp_d, 'Personnel Services', 'Payroll', 18000.00,
    'Completed', '2026-06-26 10:00:00+08', '2026-06-30', '2026-06-30', 6, 2026,
    'SK Office, Brgy. San Jose',
    'June 2026 honoraria disbursed to 11 SK officials',
    'Disbursement voucher DV-2026-0001. Payroll register signed by all payees.',
    '[
      {"item":"SK Chairman Honoraria","quantity":1,"unit":"mo","unitCost":2000,"total":2000},
      {"item":"SK Secretary Honoraria","quantity":1,"unit":"mo","unitCost":1500,"total":1500},
      {"item":"SK Treasurer Honoraria","quantity":1,"unit":"mo","unitCost":1500,"total":1500},
      {"item":"SK Kagawad Honoraria (8 members)","quantity":8,"unit":"mo","unitCost":1625,"total":13000}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    true, 'Disbursed via barangay cashier',
    '2026-06-30 15:00:00+08', '2026-06-30 15:00:00+08'
  ) RETURNING id INTO v_req_d1;

  -- E1: Bags and seedlings — 5,500 (receipt uploaded but NOT yet verified)
  INSERT INTO public.expenses (
    parent_project_id, category, type, amount,
    project_status, approved_at, date, event_date, month, year,
    venue, description, notes, breakdown, expenses_breakdown,
    requested_by, created_by, is_additional, remarks, created_at, updated_at
  ) VALUES (
    v_exp_e, 'Environment', 'Project', 5500.00,
    'Ongoing', '2026-07-12 11:00:00+08', '2026-07-18', '2026-07-20', 7, 2026,
    'Brgy. San Jose Main Road & Estero Area',
    'Garbage bags and tree seedlings for the July clean-up',
    'Receipt uploaded but still awaiting scan verification.',
    '[
      {"item":"Garbage Bags (heavy duty)","quantity":10,"unit":"rolls","unitCost":200,"total":2000},
      {"item":"Seedlings (mahogany/narra)","quantity":100,"unit":"pcs","unitCost":35,"total":3500}
    ]'::jsonb,
    '[]'::jsonb,
    'Angel Faith Ogatis — SK Treasurer',
    '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
    true, 'Paid to Green Earth Agri Supply',
    '2026-07-18 10:00:00+08', '2026-07-18 10:00:00+08'
  ) RETURNING id INTO v_req_e1;

  -- ==============================================================
  -- 5. RECEIPT RECORDS
  -- --------------------------------------------------------------
  -- record_id is ALWAYS the approved parent (it owns the receipt
  -- collection); requisition_id scopes the receipt to one line item.
  -- Both are TEXT columns, so the expense IDs are cast.
  --
  -- A verified receipt (ocr_verified_at + numeric ocr_metadata
  -- totalAmount) is what the public transparency portal publishes as
  -- actual expenditure. The clean-up drive receipt is deliberately
  -- left unverified to exercise the "not yet reported" path.
  -- ==============================================================
  INSERT INTO public.receipt_records (
    id, record_type, record_id, requisition_id,
    file_path, public_url, file_name, file_type,
    is_scanned, ocr_metadata, ocr_verified_at, ocr_verified_by,
    uploaded_by_id, uploaded_by_name, uploaded_by_role, uploaded_at
  ) VALUES
    ('ce000001-0000-0000-0000-000000000001', 'Event', v_exp_a::text, v_req_a1::text,
     'receipts/2026/03/linggo-sound-system.jpg',
     'https://placehold.co/400x600/png?text=Sound+System+Receipt',
     'linggo-sound-system.jpg', 'image/jpeg',
     true,
     '{"vendor":"Audio Solutions PH","orNumber":"2026-0312","date":"2026-03-21","totalAmount":8000}'::jsonb,
     '2026-03-21 11:00:00+08', 'Angel Faith Ogatis — SK Treasurer',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Angel Faith Ogatis', 'SK Treasurer',
     '2026-03-21 10:30:00+08'),

    ('ce000002-0000-0000-0000-000000000002', 'Event', v_exp_a::text, v_req_a2::text,
     'receipts/2026/03/linggo-snacks-sm.jpg',
     'https://placehold.co/400x600/png?text=SM+Supermarket+Receipt',
     'linggo-snacks-sm.jpg', 'image/jpeg',
     true,
     '{"vendor":"SM Supermarket","orNumber":"SM-884213","date":"2026-03-22","totalAmount":12000}'::jsonb,
     '2026-03-22 19:00:00+08', 'Angel Faith Ogatis — SK Treasurer',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Angel Faith Ogatis', 'SK Treasurer',
     '2026-03-22 18:30:00+08'),

    ('ce000003-0000-0000-0000-000000000003', 'Event', v_exp_a::text, v_req_a2::text,
     'receipts/2026/03/linggo-prizes-nbs.jpg',
     'https://placehold.co/400x600/png?text=National+Bookstore+Receipt',
     'linggo-prizes-nbs.jpg', 'image/jpeg',
     true,
     '{"vendor":"National Bookstore","orNumber":"NBS-55120","date":"2026-03-22","totalAmount":4000}'::jsonb,
     '2026-03-22 19:10:00+08', 'Angel Faith Ogatis — SK Treasurer',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Angel Faith Ogatis', 'SK Treasurer',
     '2026-03-22 18:45:00+08'),

    ('ce000004-0000-0000-0000-000000000004', 'Event', v_exp_a::text, v_req_a3::text,
     'receipts/2026/03/linggo-tarpaulin.jpg',
     'https://placehold.co/400x600/png?text=Tarpaulin+Receipt',
     'linggo-tarpaulin.jpg', 'image/jpeg',
     true,
     '{"vendor":"Sunrise Digital Printing","orNumber":"SDP-1042","date":"2026-03-19","totalAmount":1500}'::jsonb,
     '2026-03-19 15:00:00+08', 'Angel Faith Ogatis — SK Treasurer',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Angel Faith Ogatis', 'SK Treasurer',
     '2026-03-19 14:30:00+08'),

    ('ce000005-0000-0000-0000-000000000005', 'Project', v_exp_b::text, v_req_b1::text,
     'receipts/2026/05/training-materials-deeco.jpg',
     'https://placehold.co/400x600/png?text=Deeco+Electronics+Receipt',
     'training-materials-deeco.jpg', 'image/jpeg',
     true,
     '{"vendor":"Deeco Electronics Supply","orNumber":"DES-7781","date":"2026-05-05","totalAmount":18000}'::jsonb,
     '2026-05-05 10:00:00+08', 'Angel Faith Ogatis — SK Treasurer',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Angel Faith Ogatis', 'SK Treasurer',
     '2026-05-05 09:30:00+08'),

    ('ce000006-0000-0000-0000-000000000006', 'Event', v_exp_c::text, v_req_c1::text,
     'receipts/2026/05/basketball-tobys.jpg',
     'https://placehold.co/400x600/png?text=Tobys+Sports+Receipt',
     'basketball-tobys.jpg', 'image/jpeg',
     true,
     '{"vendor":"Toby''s Sports","orNumber":"TS-330914","date":"2026-05-28","totalAmount":11300}'::jsonb,
     '2026-05-28 10:00:00+08', 'Angel Faith Ogatis — SK Treasurer',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Angel Faith Ogatis', 'SK Treasurer',
     '2026-05-28 09:30:00+08'),

    ('ce000007-0000-0000-0000-000000000007', 'Event', v_exp_c::text, v_req_c2::text,
     'receipts/2026/06/basketball-referees.pdf',
     'https://placehold.co/400x600/png?text=Referee+Payout+Sheet',
     'basketball-referees.pdf', 'application/pdf',
     false,
     '{"vendor":"Barangay Accredited Referees","orNumber":"RF-2026-06","date":"2026-06-14","totalAmount":5000}'::jsonb,
     '2026-06-14 18:00:00+08', 'Angel Faith Ogatis — SK Treasurer',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Angel Faith Ogatis', 'SK Treasurer',
     '2026-06-14 17:30:00+08'),

    ('ce000008-0000-0000-0000-000000000008', 'Event', v_exp_c::text, v_req_c3::text,
     'receipts/2026/06/basketball-supplies.jpg',
     'https://placehold.co/400x600/png?text=Volunteer+Supplies+Receipt',
     'basketball-supplies.jpg', 'image/jpeg',
     true,
     '{"vendor":"Sunrise Digital Printing","orNumber":"SDP-1188","date":"2026-06-15","totalAmount":5700}'::jsonb,
     '2026-06-15 12:00:00+08', 'Angel Faith Ogatis — SK Treasurer',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Angel Faith Ogatis', 'SK Treasurer',
     '2026-06-15 11:30:00+08'),

    -- Payroll disbursement voucher — verified, but Payroll is never published publicly.
    ('ce000009-0000-0000-0000-000000000009', 'Payroll', v_exp_d::text, v_req_d1::text,
     'receipts/2026/06/payroll-june-2026.pdf',
     'https://placehold.co/400x600/png?text=Payroll+Disbursement+Voucher',
     'payroll-june-2026.pdf', 'application/pdf',
     false,
     '{"vendor":"SK Barangay San Jose","orNumber":"DV-2026-0001","date":"2026-06-30","totalAmount":18000}'::jsonb,
     '2026-06-30 16:00:00+08', 'Angel Faith Ogatis — SK Treasurer',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Angel Faith Ogatis', 'SK Treasurer',
     '2026-06-30 15:30:00+08'),

    -- Scanned but NOT yet verified: ocr_verified_at and ocr_metadata stay NULL,
    -- so the clean-up drive keeps its entered amount (₱5,500.00) and publishes
    -- no figure. Exercises the "recorded, pending verification" path.
    ('ce00000a-0000-0000-0000-00000000000a', 'Project', v_exp_e::text, v_req_e1::text,
     'receipts/2026/07/cleanup-green-earth.jpg',
     'https://placehold.co/400x600/png?text=Green+Earth+Agri+Receipt',
     'cleanup-green-earth.jpg', 'image/jpeg',
     true,
     NULL,
     NULL, NULL,
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Angel Faith Ogatis', 'SK Treasurer',
     '2026-07-18 10:20:00+08')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Cuenta seed: 5 approved allocations, 9 requisitions and 10 receipts created.';

EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Skipping expenses / receipts — a required table does not exist.';
  WHEN undefined_column THEN
    RAISE NOTICE 'Skipping expenses / receipts — columns missing (run pending migrations first).';
END $$;


-- ================================================================
-- 6. DOCUMENTS  (generated financial documents)
-- ================================================================
-- related_entity_id is TEXT. Expense-backed documents resolve the
-- generated expense ID with a subquery rather than a literal.
-- ================================================================
DO $$ BEGIN
  INSERT INTO public.documents (
    id, date_generated, name, project, generated_by, created_by, type,
    related_entity_type, related_entity_id,
    file_name, status, data
  ) VALUES
    ('d0c00001-0000-0000-0000-000000000001', '2026-03-10 09:30:00+08',
     'PR-2026-0001 — Linggo ng Kabataan 2026',
     'Linggo ng Kabataan 2026', 'Angel Faith Ogatis',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Purchase Request',
     'Budget Request', 'a1a1a1a1-0001-0001-0001-000000000001',
     'pr-2026-0001-linggo-ng-kabataan.pdf', 'generated',
     '{"prNumber":"PR-2026-0001","event":"Linggo ng Kabataan 2026","amount":28500,"requestedBy":"Angel Faith Ogatis"}'::jsonb),

    ('d0c00002-0000-0000-0000-000000000002', '2026-04-28 10:30:00+08',
     'PR-2026-0002 — Youth Skills Training — Basic Electronics',
     'Youth Skills Training — Basic Electronics', 'Angel Faith Ogatis',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Purchase Request',
     'Budget Request', 'b2b2b2b2-0002-0002-0002-000000000002',
     'pr-2026-0002-skills-training.pdf', 'generated',
     '{"prNumber":"PR-2026-0002","event":"Youth Skills Training — Basic Electronics","amount":35000,"requestedBy":"Angel Faith Ogatis"}'::jsonb),

    ('d0c00003-0000-0000-0000-000000000003', '2026-05-20 09:30:00+08',
     'PR-2026-0003 — SK Basketball League Summer 2026',
     'SK Barangay Basketball League — Summer 2026', 'Angel Faith Ogatis',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Purchase Request',
     'Budget Request', 'c3c3c3c3-0003-0003-0003-000000000003',
     'pr-2026-0003-basketball-league.pdf', 'generated',
     '{"prNumber":"PR-2026-0003","event":"SK Barangay Basketball League — Summer 2026","amount":22000,"requestedBy":"Angel Faith Ogatis"}'::jsonb),

    ('d0c00004-0000-0000-0000-000000000004', '2026-06-25 09:30:00+08',
     'DV-2026-0001 — SK Officers Honoraria June 2026',
     'SK Officers Honoraria — June 2026', 'Angel Faith Ogatis',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Disbursement Voucher',
     'Expense',
     (SELECT id::text FROM public.expenses
       WHERE request_id = 'd4d4d4d4-0004-0004-0004-000000000004' LIMIT 1),
     'dv-2026-0001-honoraria-june.pdf', 'generated',
     '{"dvNumber":"DV-2026-0001","payroll":"SK Officers Honoraria — June 2026","amount":18000,"preparedBy":"Angel Faith Ogatis"}'::jsonb),

    ('d0c00005-0000-0000-0000-000000000005', '2026-03-25 14:00:00+08',
     'LR-2026-0001 — Linggo ng Kabataan 2026 Liquidation',
     'Linggo ng Kabataan 2026', 'Angel Faith Ogatis',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'Liquidation Report',
     'Expense',
     (SELECT id::text FROM public.expenses
       WHERE request_id = 'a1a1a1a1-0001-0001-0001-000000000001' LIMIT 1),
     'lr-2026-0001-linggo-liquidation.pdf', 'generated',
     '{"lrNumber":"LR-2026-0001","event":"Linggo ng Kabataan 2026","approvedBudget":28500,"actualExpenses":25500,"savings":3000}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping documents — table does not exist.';
         WHEN undefined_column THEN
  RAISE NOTICE 'Skipping documents — columns missing (run pending migrations first).';
END $$;


-- ================================================================
-- 7. AUDIT TRAIL  (append-only activity log)
-- ================================================================
DO $$ BEGIN
  INSERT INTO public.audit_trail (
    id, user_id, user_name, user_role,
    action, action_type, module,
    record_type, record_id,
    description, status, created_at
  ) VALUES
    ('a0d10001-0000-0000-0000-000000000001', '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
     'Angel Faith Ogatis', 'SK Treasurer',
     'Budget Allocated — January 2026', 'Budget Created', 'Budgets', 'Budget', '',
     'Allocated ₱45,000.00 for January 2026 (Q1) from DILG Allocation.', 'Success', '2026-01-03 08:05:00+08'),

    ('a0d10002-0000-0000-0000-000000000002', '80d255a8-ef5a-45de-a360-ee5e6be61474',
     'James Zander Yu', 'SK Chairman',
     'User Login', 'Login', 'Authentication', 'User', '',
     'SK Chairman logged into the system.', 'Success', '2026-03-10 08:55:00+08'),

    ('a0d10003-0000-0000-0000-000000000003', '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
     'Angel Faith Ogatis', 'SK Treasurer',
     'Budget Request Submitted — Linggo ng Kabataan 2026', 'Request Submitted', 'Budget Requests',
     'Budget Request', 'a1a1a1a1-0001-0001-0001-000000000001',
     'Submitted budget request for Linggo ng Kabataan 2026 (₱28,500.00).', 'Success', '2026-03-10 09:00:00+08'),

    ('a0d10004-0000-0000-0000-000000000004', '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
     'Angel Faith Ogatis', 'SK Treasurer',
     'Document Generated — PR-2026-0001', 'Document Generated', 'Documents', 'Document', '',
     'Generated Purchase Request PR-2026-0001 for Linggo ng Kabataan 2026.', 'Success', '2026-03-10 09:30:00+08'),

    ('a0d10005-0000-0000-0000-000000000005', '80d255a8-ef5a-45de-a360-ee5e6be61474',
     'James Zander Yu', 'SK Chairman',
     'Request Approved — Linggo ng Kabataan 2026', 'Request Approved', 'Budget Requests',
     'Budget Request', 'a1a1a1a1-0001-0001-0001-000000000001',
     'Approved budget request for Linggo ng Kabataan 2026 (₱28,500.00).', 'Success', '2026-03-12 14:00:00+08'),

    ('a0d10006-0000-0000-0000-000000000006', '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
     'Angel Faith Ogatis', 'SK Treasurer',
     'Receipt Uploaded — Sound System Rental', 'Receipt Uploaded', 'Receipts',
     'Receipt',
     COALESCE((SELECT id::text FROM public.expenses
                WHERE request_id = 'a1a1a1a1-0001-0001-0001-000000000001' LIMIT 1), ''),
     'Uploaded and verified receipt for sound system rental (₱8,000.00) under Linggo ng Kabataan 2026.', 'Success', '2026-03-21 10:30:00+08'),

    ('a0d10007-0000-0000-0000-000000000007', '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
     'Angel Faith Ogatis', 'SK Treasurer',
     'Liquidation Filed — Linggo ng Kabataan 2026', 'Document Generated', 'Documents', 'Document', '',
     'Filed Liquidation Report LR-2026-0001. Spent ₱25,500.00 of ₱28,500.00; ₱3,000.00 returned as savings.', 'Success', '2026-03-25 14:00:00+08'),

    ('a0d10008-0000-0000-0000-000000000008', '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
     'Angel Faith Ogatis', 'SK Treasurer',
     'Budget Request Submitted — Youth Skills Training', 'Request Submitted', 'Budget Requests',
     'Budget Request', 'b2b2b2b2-0002-0002-0002-000000000002',
     'Submitted budget request for Youth Skills Training — Basic Electronics (₱35,000.00).', 'Success', '2026-04-28 10:00:00+08'),

    ('a0d10009-0000-0000-0000-000000000009', '80d255a8-ef5a-45de-a360-ee5e6be61474',
     'James Zander Yu', 'SK Chairman',
     'Request Approved — Youth Skills Training', 'Request Approved', 'Budget Requests',
     'Budget Request', 'b2b2b2b2-0002-0002-0002-000000000002',
     'Approved budget request for Youth Skills Training — Basic Electronics (₱35,000.00).', 'Success', '2026-04-30 09:30:00+08'),

    ('a0d1000a-0000-0000-0000-00000000000a', '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
     'Angel Faith Ogatis', 'SK Treasurer',
     'Budget Request Submitted — Basketball League', 'Request Submitted', 'Budget Requests',
     'Budget Request', 'c3c3c3c3-0003-0003-0003-000000000003',
     'Submitted budget request for SK Barangay Basketball League (₱22,000.00).', 'Success', '2026-05-20 09:00:00+08'),

    ('a0d1000b-0000-0000-0000-00000000000b', '80d255a8-ef5a-45de-a360-ee5e6be61474',
     'James Zander Yu', 'SK Chairman',
     'Request Approved — Basketball League', 'Request Approved', 'Budget Requests',
     'Budget Request', 'c3c3c3c3-0003-0003-0003-000000000003',
     'Approved budget request for SK Barangay Basketball League (₱22,000.00).', 'Success', '2026-05-22 11:00:00+08'),

    ('a0d1000c-0000-0000-0000-00000000000c', '16257f00-adff-4f11-abe7-fd3f5f6ef065',
     'Vince Villar', 'SK Kagawad',
     'Viewed Transparency Report', 'Report Viewed', 'Reports', 'Report', '',
     'Viewed the Q2 2026 budget utilization report.', 'Success', '2026-07-02 10:15:00+08'),

    ('a0d1000d-0000-0000-0000-00000000000d', '80d255a8-ef5a-45de-a360-ee5e6be61474',
     'James Zander Yu', 'SK Chairman',
     'Request Rejected — Leadership Camp', 'Request Rejected', 'Budget Requests',
     'Budget Request', 'a7a7a7a7-0007-0007-0007-000000000007',
     'Rejected budget request for SK Youth Leadership Camp 2026 (₱65,000.00). Reason: budget exceeds the available Q4 allocation.', 'Success', '2026-08-17 14:00:00+08'),

    ('a0d1000e-0000-0000-0000-00000000000e', '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
     'Angel Faith Ogatis', 'SK Treasurer',
     'Budget Request Submitted — Anti-Drug Seminar', 'Request Submitted', 'Budget Requests',
     'Budget Request', 'f6f6f6f6-0006-0006-0006-000000000006',
     'Submitted budget request for Anti-Drug Awareness Seminar (₱9,500.00).', 'Success', '2026-08-22 10:00:00+08')
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping audit_trail — table does not exist.';
         WHEN undefined_column THEN
  RAISE NOTICE 'Skipping audit_trail — columns missing (run pending migrations first).';
END $$;


-- ================================================================
-- 8. NOTIFICATIONS
-- ================================================================
-- NOTE: this table has no is_read column. Read state is per-device and
-- lives in localStorage (see src/context/NotificationContext.jsx).
-- ================================================================
DO $$ BEGIN
  INSERT INTO public.notifications (
    id, type, title, message,
    actor_id, actor_role, recipient_role, request_id,
    created_at
  ) VALUES
    ('bf000001-0000-0000-0000-000000000001', 'approval', 'Budget Request Approved',
     E'Event: Linggo ng Kabataan 2026\nApproved: ₱28,500.00',
     '80d255a8-ef5a-45de-a360-ee5e6be61474',
     'SK Chairman', 'SK Treasurer', 'a1a1a1a1-0001-0001-0001-000000000001',
     '2026-03-12 14:01:00+08'),

    ('bf000002-0000-0000-0000-000000000002', 'approval', 'Budget Request Approved',
     E'Project: Youth Skills Training — Basic Electronics\nApproved: ₱35,000.00',
     '80d255a8-ef5a-45de-a360-ee5e6be61474',
     'SK Chairman', 'SK Treasurer', 'b2b2b2b2-0002-0002-0002-000000000002',
     '2026-04-30 09:31:00+08'),

    ('bf000003-0000-0000-0000-000000000003', 'approval', 'Budget Request Approved',
     E'Event: SK Barangay Basketball League — Summer 2026\nApproved: ₱22,000.00',
     '80d255a8-ef5a-45de-a360-ee5e6be61474',
     'SK Chairman', 'SK Treasurer', 'c3c3c3c3-0003-0003-0003-000000000003',
     '2026-05-22 11:01:00+08'),

    ('bf000004-0000-0000-0000-000000000004', 'rejection', 'Budget Request Rejected',
     E'Event: SK Youth Leadership Camp 2026\nReason: budget exceeds the available Q4 allocation.',
     '80d255a8-ef5a-45de-a360-ee5e6be61474',
     'SK Chairman', 'SK Treasurer', 'a7a7a7a7-0007-0007-0007-000000000007',
     '2026-08-17 14:01:00+08'),

    ('bf000005-0000-0000-0000-000000000005', 'submission', 'New Budget Request Pending Review',
     E'Event: Anti-Drug Awareness Seminar for Youth\nRequested: ₱9,500.00\nSubmitted by: Angel Faith Ogatis — SK Treasurer',
     '626d4acd-da6a-4dc9-957f-c5fa8525ed98',
     'SK Treasurer', 'SK Chairman', 'f6f6f6f6-0006-0006-0006-000000000006',
     '2026-08-22 10:01:00+08')
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping notifications — table does not exist.';
         WHEN undefined_column THEN
  RAISE NOTICE 'Skipping notifications — columns missing (run pending migrations first).';
END $$;


-- ================================================================
-- 9. CHAT HISTORY  (sample Cue conversations)
-- ================================================================
-- user_id is NOT NULL and references auth.users, so every row is
-- attributed to the SK Treasurer. Figures below match the seeded data.
-- ================================================================
DO $$ BEGIN
  IF to_regclass('public.chat_history') IS NOT NULL THEN
    INSERT INTO public.chat_history (id, user_id, role, content, created_at)
    VALUES
      ('cb000001-0000-0000-0000-000000000001', '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'user',
       'What is the total budget allocated for 2026 so far?',
       '2026-08-20 09:00:00+08'),
      ('cb000002-0000-0000-0000-000000000002', '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'assistant',
       'Total allocations recorded for 2026 come to ₱465,000.00: ₱135,000.00 in Q1, ₱165,000.00 in Q2 (including the ₱15,000.00 mid-year Barangay Subsidy), and ₱165,000.00 in Q3. Of that, ₱115,500.00 has been committed to approved projects and events. Would you like a breakdown by quarter?',
       '2026-08-20 09:00:05+08'),
      ('cb000003-0000-0000-0000-000000000003', '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'user',
       'How much has actually been spent on Events vs Projects vs Payroll?',
       '2026-08-20 09:02:00+08'),
      ('cb000004-0000-0000-0000-000000000004', '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'assistant',
       E'Here is recorded spending against approved allocations:\n\n- **Events:** ₱47,500.00 spent of ₱50,500.00 approved (Linggo ng Kabataan ₱25,500.00; Basketball League ₱22,000.00)\n- **Projects:** ₱23,500.00 spent of ₱47,000.00 approved (Skills Training ₱18,000.00; Clean-Up Drive ₱5,500.00 — both still ongoing)\n- **Payroll:** ₱18,000.00 spent of ₱18,000.00 approved (June honoraria)\n\n**Total recorded spending:** ₱89,000.00 of ₱115,500.00 approved, or 77.1% utilization. Against the full ₱465,000.00 in allocations, that is 19.1%.',
       '2026-08-20 09:02:08+08'),
      ('cb000005-0000-0000-0000-000000000005', '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'user',
       'Which projects are still ongoing?',
       '2026-08-20 09:05:00+08'),
      ('cb000006-0000-0000-0000-000000000006', '626d4acd-da6a-4dc9-957f-c5fa8525ed98', 'assistant',
       E'There are **2 ongoing activities**:\n\n1. **Youth Skills Training — Basic Electronics** — ₱18,000.00 recorded of ₱35,000.00 approved. The trainer fee and participant meals are still to be liquidated.\n2. **Barangay Clean-Up Drive & Tree Planting** — ₱5,500.00 recorded of ₱12,000.00 approved. Its receipt is uploaded but not yet scan-verified.\n\nOne request is also awaiting your Chairman''s review: the Anti-Drug Awareness Seminar (₱9,500.00, 5 September 2026). Would you like a summary report for any of these?',
       '2026-08-20 09:05:06+08')
    ON CONFLICT (id) DO NOTHING;
  END IF;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping chat_history — table does not exist.';
         WHEN undefined_column THEN
  RAISE NOTICE 'Skipping chat_history — columns missing (run pending migrations first).';
END $$;


-- ================================================================
-- Done
-- ================================================================
-- Seeded:
--   Budgets          : 10 allocation rows (Jan–Sep 2026) = ₱465,000
--   Budget Requests  : 7  (5 Approved, 1 Pending, 1 Rejected)
--   Expenses         : 5 approved allocations + 9 requisitions
--   Receipt Records  : 10 (9 verified, 1 awaiting verification)
--   Documents        : 5  (3 PR, 1 DV, 1 LR)
--   Audit Trail      : 14 entries
--   Notifications    : 5
--   Chat History     : 6 messages (3 exchanges)
--
-- Financial summary:
--   Allocated 465,000 | Approved 115,500 | Recorded 89,000 (77.1%)
--
-- Public transparency portal will publish the two Completed events —
-- Linggo ng Kabataan (₱25,500 verified) and the Basketball League
-- (₱22,000 verified). Payroll and ongoing work stay internal.
-- ================================================================
