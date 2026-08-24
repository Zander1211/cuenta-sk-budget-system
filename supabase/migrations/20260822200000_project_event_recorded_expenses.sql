-- Persist actual expense rows against the approved Project/Event record.
-- The parent column deliberately inherits expenses.id's deployed type because
-- older Cuenta environments use BIGINT while an earlier draft assumed UUID.

DO $$
DECLARE
  expense_id_type TEXT;
  parent_id_type TEXT;
  linked_row_count BIGINT;
BEGIN
  SELECT format_type(attribute.atttypid, attribute.atttypmod)
  INTO expense_id_type
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.expenses'::regclass
    AND attribute.attname = 'id'
    AND NOT attribute.attisdropped;

  IF expense_id_type IS NULL THEN
    RAISE EXCEPTION 'public.expenses.id is required';
  END IF;

  SELECT format_type(attribute.atttypid, attribute.atttypmod)
  INTO parent_id_type
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.expenses'::regclass
    AND attribute.attname = 'parent_project_id'
    AND NOT attribute.attisdropped;

  IF parent_id_type IS NOT NULL AND parent_id_type <> expense_id_type THEN
    SELECT count(*) INTO linked_row_count
    FROM public.expenses
    WHERE parent_project_id IS NOT NULL;

    IF linked_row_count > 0 THEN
      RAISE EXCEPTION
        'Cannot change expenses.parent_project_id from % to % while linked rows exist',
        parent_id_type,
        expense_id_type;
    END IF;

    ALTER TABLE public.expenses DROP COLUMN parent_project_id;
    parent_id_type := NULL;
  END IF;

  IF parent_id_type IS NULL THEN
    EXECUTE format(
      'ALTER TABLE public.expenses ADD COLUMN parent_project_id %s',
      expense_id_type
    );
  END IF;
END;
$$;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS is_additional BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remarks TEXT;

CREATE INDEX IF NOT EXISTS idx_expenses_parent_project_id
  ON public.expenses(parent_project_id)
  WHERE parent_project_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.expenses'::regclass
      AND conname = 'expenses_parent_project_id_fkey'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_parent_project_id_fkey
      FOREIGN KEY (parent_project_id)
      REFERENCES public.expenses(id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

COMMENT ON COLUMN public.expenses.parent_project_id IS
  'Approved Project/Event expense row that owns this recorded actual expense.';
COMMENT ON COLUMN public.expenses.is_additional IS
  'True for an actual recorded expense; false for an approved allocation row.';

DO $$
BEGIN
  IF to_regclass('public.expenses') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'expenses'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
  END IF;

  IF to_regclass('public.receipt_records') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'receipt_records'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.receipt_records;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
