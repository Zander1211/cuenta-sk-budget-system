-- Persist budget requests for authenticated Cuenta users.
CREATE TABLE IF NOT EXISTS public.budget_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'Project',
  event TEXT NOT NULL,
  category TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  event_date DATE,
  venue TEXT,
  description TEXT,
  notes TEXT,
  breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  expenses_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_by TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  project_status TEXT NOT NULL DEFAULT 'Pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  resubmitted_at TIMESTAMPTZ,
  revision_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Support projects where an older partial table already exists.
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Project';
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS event TEXT;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS event_date DATE;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS breakdown JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS expenses_breakdown JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS requested_by TEXT;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending';
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS project_status TEXT DEFAULT 'Pending';
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS resubmitted_at TIMESTAMPTZ;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS revision_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS archived_by TEXT;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.budget_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_budget_requests_created_at
  ON public.budget_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_budget_requests_status
  ON public.budget_requests(status);

ALTER TABLE public.budget_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read budget requests" ON public.budget_requests;
CREATE POLICY "Authenticated users can read budget requests"
  ON public.budget_requests FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert budget requests" ON public.budget_requests;
CREATE POLICY "Authenticated users can insert budget requests"
  ON public.budget_requests FOR INSERT TO authenticated
  WITH CHECK (created_by IS NULL OR created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can update budget requests" ON public.budget_requests;
CREATE POLICY "Authenticated users can update budget requests"
  ON public.budget_requests FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete budget requests" ON public.budget_requests;
CREATE POLICY "Authenticated users can delete budget requests"
  ON public.budget_requests FOR DELETE TO authenticated USING (true);
