-- ================================================================
-- Cuenta: Create Receipt Records Table and RLS
-- ================================================================

-- Create the receipt_records table
CREATE TABLE IF NOT EXISTS public.receipt_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_type TEXT NOT NULL, -- e.g., 'Project', 'Event', 'Payroll', 'Expense'
    record_id TEXT NOT NULL,   -- ID of the related record
    file_path TEXT NOT NULL,
    public_url TEXT,
    file_name TEXT NOT NULL,
    file_type TEXT,
    uploaded_by_id TEXT,
    uploaded_by_name TEXT,
    uploaded_by_role TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.receipt_records ENABLE ROW LEVEL SECURITY;

-- 1. Policy: View receipts (SK Kagawad, Barangay Treasurer, SK Chairman, SK Treasurer)
CREATE POLICY "Users can view all receipt records"
ON public.receipt_records FOR SELECT
TO authenticated
USING (true); -- Allow all authenticated users to read

-- 2. Policy: Insert receipts (SK Chairman, SK Treasurer)
CREATE POLICY "SK Chairman and SK Treasurer can insert receipt records"
ON public.receipt_records FOR INSERT
TO authenticated
WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') IN ('SK Chairman', 'SK Treasurer')
);

-- 3. Policy: Delete/Update receipts (Optional, usually restricted or admin only)
CREATE POLICY "SK Chairman and SK Treasurer can update receipt records"
ON public.receipt_records FOR UPDATE
TO authenticated
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') IN ('SK Chairman', 'SK Treasurer')
);

-- Create index for faster lookups by record_id
CREATE INDEX IF NOT EXISTS idx_receipt_records_record_id ON public.receipt_records(record_id);
