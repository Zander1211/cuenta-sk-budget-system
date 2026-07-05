-- ================================================================
-- Cuenta: Create Expenses Status Trigger for RBAC
-- ================================================================

-- Create a function that checks the user's role before allowing updates to projectStatus or status
CREATE OR REPLACE FUNCTION check_expenses_status_update_role()
RETURNS TRIGGER AS $}$
DECLARE
  user_role TEXT;
BEGIN
  -- Only run checks if the status or projectStatus columns are being changed
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.projectStatus IS DISTINCT FROM OLD.projectStatus THEN
    -- Get the role from the JWT metadata
    user_role := current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role';
    
    -- If the role is not SK Chairman (or if we are not in an authenticated session/role is null), deny the update.
    -- We allow service_role to bypass this if needed, but for authenticated users we strictly check.
    IF current_user = 'authenticated' THEN
      IF user_role IS DISTINCT FROM 'SK Chairman' THEN
        RAISE EXCEPTION 'Only the SK Chairman is permitted to change the status or projectStatus of an expense or request.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$}$ LANGUAGE plpgsql;

-- Drop the trigger if it exists to avoid errors on reruns
DROP TRIGGER IF EXISTS enforce_expenses_status_role ON expenses;

-- Create the trigger on the expenses table
CREATE TRIGGER enforce_expenses_status_role
  BEFORE UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION check_expenses_status_update_role();
