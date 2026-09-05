-- The original single-SK-Chairman enforcement (has_sk_chairman(), the
-- only_one_sk_chairman unique index, and check_single_sk_chairman()) counted
-- ANY created_accounts row with role = 'SK Chairman', including disabled
-- ones. That meant once the sole SK Chairman disabled their own account,
-- nobody could register a replacement — a permanent lockout, since only the
-- SK Chairman role can access User Management to re-enable anyone.
--
-- Fix: only an ACTIVE SK Chairman occupies the singleton slot. A disabled
-- chairman account frees it up, exactly like the SK Treasurer / Barangay
-- Treasurer / SK Kagawad active-account role limits already work.

-- 1. has_sk_chairman(): only count an active chairman.
CREATE OR REPLACE FUNCTION public.has_sk_chairman()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.created_accounts
    WHERE role = 'SK Chairman' AND is_active IS NOT FALSE
  );
$$;

-- 2. Unique index: only enforce uniqueness among active chairman rows, so a
--    disabled chairman's row no longer blocks inserting a new active one.
DROP INDEX IF EXISTS only_one_sk_chairman;
CREATE UNIQUE INDEX IF NOT EXISTS only_one_active_sk_chairman
ON public.created_accounts (role)
WHERE role = 'SK Chairman' AND is_active IS NOT FALSE;

-- 3. Trigger guard on auth.users: only block on an existing ACTIVE chairman.
CREATE OR REPLACE FUNCTION public.check_single_sk_chairman()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (NEW.raw_user_meta_data->>'role') = 'SK Chairman' THEN
    IF EXISTS (
      SELECT 1 FROM public.created_accounts
      WHERE role = 'SK Chairman' AND id != NEW.id AND is_active IS NOT FALSE
    ) THEN
      RAISE EXCEPTION 'An SK Chairman account already exists. Only one SK Chairman account is allowed.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
