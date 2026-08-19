-- 1. Create a function to check if an SK Chairman exists.
-- Used by the frontend to conditionally show the registration form.
CREATE OR REPLACE FUNCTION public.has_sk_chairman()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.created_accounts WHERE role = 'SK Chairman'
  );
$$;

-- 2. Prevent multiple SK Chairmen in created_accounts via unique partial index
CREATE UNIQUE INDEX IF NOT EXISTS only_one_sk_chairman 
ON public.created_accounts (role) 
WHERE role = 'SK Chairman';

-- 3. Trigger to prevent multiple SK Chairman signups and bypass attempts via auth API
CREATE OR REPLACE FUNCTION public.check_single_sk_chairman()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If the user is trying to set their role to 'SK Chairman'
  IF (NEW.raw_user_meta_data->>'role') = 'SK Chairman' THEN
    -- Check if one already exists (excluding the current row if it's an update)
    IF EXISTS (SELECT 1 FROM public.created_accounts WHERE role = 'SK Chairman' AND id != NEW.id) THEN
      RAISE EXCEPTION 'An SK Chairman account already exists. Only one SK Chairman account is allowed.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_single_sk_chairman ON auth.users;
CREATE TRIGGER enforce_single_sk_chairman
BEFORE INSERT OR UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.check_single_sk_chairman();

-- 4. Trigger to automatically insert SK Chairman into created_accounts upon successful signup
CREATE OR REPLACE FUNCTION public.auto_insert_sk_chairman()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (NEW.raw_user_meta_data->>'role') = 'SK Chairman' THEN
    INSERT INTO public.created_accounts (id, email, full_name, role)
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data->>'full_name',
      'SK Chairman'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_insert_sk_chairman_trigger ON auth.users;
CREATE TRIGGER auto_insert_sk_chairman_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_insert_sk_chairman();
