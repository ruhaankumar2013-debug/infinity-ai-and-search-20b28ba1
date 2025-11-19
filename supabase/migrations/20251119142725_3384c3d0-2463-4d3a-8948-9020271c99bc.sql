-- Add user_id columns to conversations and messages tables
-- This fixes the PUBLIC_DATA_EXPOSURE vulnerability

-- Step 1: Add user_id column to conversations table
ALTER TABLE public.conversations 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Set existing conversations to NULL temporarily (will need manual assignment or deletion)
-- New conversations will require user_id

-- Step 3: Make user_id NOT NULL after data migration
-- For now, keep it nullable to allow existing data
-- You should manually assign existing conversations to users or delete them
-- Then run: ALTER TABLE public.conversations ALTER COLUMN user_id SET NOT NULL;

-- Step 4: Add user_id column to messages table
ALTER TABLE public.messages 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 5: Add indexes for performance
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_messages_user_id ON public.messages(user_id);

-- Step 6: Drop old permissive RLS policies
DROP POLICY IF EXISTS "Authenticated users can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can delete conversations" ON public.conversations;

DROP POLICY IF EXISTS "Authenticated users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can create messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can update messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can delete messages" ON public.messages;

-- Step 7: Create ownership-based RLS policies for conversations
CREATE POLICY "Users can view their own conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
ON public.conversations
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Step 8: Create ownership-based RLS policies for messages
CREATE POLICY "Users can view their own messages"
ON public.messages
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages"
ON public.messages
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Step 9: Update the trigger function to set user_id on message insert
CREATE OR REPLACE FUNCTION public.set_message_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Automatically set user_id to current authenticated user
  IF NEW.user_id IS NULL THEN
    NEW.user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_message_user_id_trigger
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.set_message_user_id();

-- Step 10: Create trigger to set conversation user_id
CREATE OR REPLACE FUNCTION public.set_conversation_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Automatically set user_id to current authenticated user
  IF NEW.user_id IS NULL THEN
    NEW.user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_conversation_user_id_trigger
BEFORE INSERT ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.set_conversation_user_id();