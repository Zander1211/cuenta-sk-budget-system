-- Function to check if the inserted email is a valid Gmail address
CREATE OR REPLACE FUNCTION public.check_gmail_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- We use ILIKE for case-insensitive matching
  IF NEW.email NOT ILIKE '%@gmail.com' THEN
    RAISE EXCEPTION 'The email address is invalid or does not exist. Please enter a valid Gmail account.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if it already exists to allow rerunning safely
DROP TRIGGER IF EXISTS enforce_gmail_only_on_signup ON auth.users;

-- Trigger to execute the validation before inserting into auth.users
CREATE TRIGGER enforce_gmail_only_on_signup
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.check_gmail_only();
