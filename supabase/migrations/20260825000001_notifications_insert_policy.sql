-- 20260825000001_notifications_insert_policy.sql
-- Add missing INSERT policy to allow authenticated users to create notifications

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);
