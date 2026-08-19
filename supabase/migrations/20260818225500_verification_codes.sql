-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  CUSTOM OTP VERIFICATION CODES TABLE                           ║
-- ║  Stores 6-digit verification codes for email verification      ║
-- ║  during account creation.                                       ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- Create the verification_codes table
CREATE TABLE IF NOT EXISTS public.verification_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by email
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON public.verification_codes(email);

-- Enable RLS
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (backend API routes use service role)
CREATE POLICY "Service role full access on verification_codes"
    ON public.verification_codes
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Auto-cleanup: delete expired codes older than 1 hour
-- (Run this manually or set up a cron job in Supabase)
-- DELETE FROM public.verification_codes WHERE expires_at < now() - interval '1 hour';
