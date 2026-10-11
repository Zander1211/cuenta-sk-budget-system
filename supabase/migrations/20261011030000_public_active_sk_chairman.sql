-- 20261011030000_public_active_sk_chairman.sql
-- Allow visitors and view-only users to see the current active SK Chairman's full name

-- 1. Security Definer function callable by anyone (anon and authenticated)
CREATE OR REPLACE FUNCTION public.get_active_sk_chairman_name()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT full_name
  FROM public.created_accounts
  WHERE role = 'SK Chairman'
    AND is_active IS NOT FALSE
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_sk_chairman_name() TO anon, authenticated;

-- 2. Read policy on created_accounts for active SK Chairman for anon
DROP POLICY IF EXISTS "Public can view active SK Chairman" ON public.created_accounts;
CREATE POLICY "Public can view active SK Chairman"
  ON public.created_accounts
  FOR SELECT
  TO anon
  USING (role = 'SK Chairman' AND is_active IS NOT FALSE);
