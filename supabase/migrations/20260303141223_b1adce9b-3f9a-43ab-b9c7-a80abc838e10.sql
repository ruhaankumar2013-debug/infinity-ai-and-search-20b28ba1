
-- Add user_id column to knowledge_entries for user-scoped teaching
ALTER TABLE public.knowledge_entries ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Anyone can read knowledge entries" ON public.knowledge_entries;
DROP POLICY IF EXISTS "Only admins can insert knowledge entries" ON public.knowledge_entries;
DROP POLICY IF EXISTS "Only admins can update knowledge entries" ON public.knowledge_entries;
DROP POLICY IF EXISTS "Only admins can delete knowledge entries" ON public.knowledge_entries;

-- SELECT: Users can read global entries (user_id IS NULL) and their own entries
CREATE POLICY "Users can read global and own knowledge entries"
ON public.knowledge_entries FOR SELECT
TO authenticated
USING (user_id IS NULL OR user_id = auth.uid());

-- Also allow public read of global entries for unauthenticated
CREATE POLICY "Anyone can read global knowledge entries"
ON public.knowledge_entries FOR SELECT
USING (user_id IS NULL);

-- INSERT: Admins can insert global entries (user_id IS NULL), any user can insert their own
CREATE POLICY "Admins can insert global knowledge entries"
ON public.knowledge_entries FOR INSERT
TO authenticated
WITH CHECK (
  (user_id IS NULL AND public.has_role(auth.uid(), 'admin'::app_role))
  OR (user_id = auth.uid())
);

-- UPDATE: Admins can update global, users can update their own
CREATE POLICY "Users can update own or admins update global knowledge"
ON public.knowledge_entries FOR UPDATE
TO authenticated
USING (
  (user_id IS NULL AND public.has_role(auth.uid(), 'admin'::app_role))
  OR (user_id = auth.uid())
);

-- DELETE: Admins can delete global, users can delete their own
CREATE POLICY "Users can delete own or admins delete global knowledge"
ON public.knowledge_entries FOR DELETE
TO authenticated
USING (
  (user_id IS NULL AND public.has_role(auth.uid(), 'admin'::app_role))
  OR (user_id = auth.uid())
);
