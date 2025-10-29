-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policy: users can view their own roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Update knowledge_entries RLS to only allow admins
DROP POLICY IF EXISTS "Anyone can delete knowledge entries" ON public.knowledge_entries;
DROP POLICY IF EXISTS "Anyone can insert knowledge entries" ON public.knowledge_entries;
DROP POLICY IF EXISTS "Anyone can update knowledge entries" ON public.knowledge_entries;
DROP POLICY IF EXISTS "Anyone can read knowledge entries" ON public.knowledge_entries;

CREATE POLICY "Anyone can read knowledge entries"
ON public.knowledge_entries
FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert knowledge entries"
ON public.knowledge_entries
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update knowledge entries"
ON public.knowledge_entries
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete knowledge entries"
ON public.knowledge_entries
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Update conversations RLS to require authentication
DROP POLICY IF EXISTS "Anyone can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Anyone can delete conversations" ON public.conversations;
DROP POLICY IF EXISTS "Anyone can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Anyone can view conversations" ON public.conversations;

CREATE POLICY "Authenticated users can view conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete conversations"
ON public.conversations
FOR DELETE
TO authenticated
USING (true);

-- Update messages RLS to require authentication
DROP POLICY IF EXISTS "Anyone can create messages" ON public.messages;
DROP POLICY IF EXISTS "Anyone can delete messages" ON public.messages;
DROP POLICY IF EXISTS "Anyone can update messages" ON public.messages;
DROP POLICY IF EXISTS "Anyone can view messages" ON public.messages;

CREATE POLICY "Authenticated users can view messages"
ON public.messages
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete messages"
ON public.messages
FOR DELETE
TO authenticated
USING (true);