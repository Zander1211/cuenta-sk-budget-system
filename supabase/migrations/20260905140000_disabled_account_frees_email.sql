-- created_accounts.email had a plain global UNIQUE constraint. Disabling an
-- account (e.g. the SK Chairman) never freed up its email address, because
-- the disabled row still occupies the directory permanently ("all historical
-- records are preserved"). Re-registering that same email later — auth.users
-- had already been deleted, so Auth itself allowed it — then failed inside
-- the auto_insert_sk_chairman AFTER INSERT trigger: its INSERT INTO
-- created_accounts violated created_accounts_email_key, aborting the whole
-- auth.users insert transaction and surfacing to the client as an opaque
-- AuthRetryableFetchError (status 500, message "{}").
--
-- Fix: mirror the same "disabled frees the resource" rule already applied to
-- roles (has_sk_chairman, the SK Treasurer/Barangay Treasurer/SK Kagawad
-- active-count limits) — only an ACTIVE row need have a unique email. A
-- disabled row keeps its historical email on record without blocking reuse.

ALTER TABLE public.created_accounts DROP CONSTRAINT IF EXISTS created_accounts_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS created_accounts_active_email_key
ON public.created_accounts (email)
WHERE is_active IS NOT FALSE;

-- Diagnostic-only functions from the investigation — no longer needed.
DROP FUNCTION IF EXISTS public.diag_auth_lookup(TEXT);
DROP FUNCTION IF EXISTS public.diag_created_accounts_constraints();
