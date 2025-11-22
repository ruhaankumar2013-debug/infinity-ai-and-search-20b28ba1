-- Fix critical security issues - Step 1: Clean up and secure chat_messages

-- 1. Add user_id to chat_messages table
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Delete orphaned chat messages (no way to associate them with users)
DELETE FROM public.chat_messages WHERE user_id IS NULL;

-- Drop the insecure public policies
DROP POLICY IF EXISTS "Anyone can read chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Anyone can insert chat messages" ON public.chat_messages;

-- Create secure owner-scoped policies
CREATE POLICY "Users can view their own chat messages" 
ON public.chat_messages 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat messages" 
ON public.chat_messages 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat messages" 
ON public.chat_messages 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat messages" 
ON public.chat_messages 
FOR DELETE 
USING (auth.uid() = user_id);

-- Make user_id NOT NULL for chat_messages
ALTER TABLE public.chat_messages 
ALTER COLUMN user_id SET NOT NULL;

-- 2. Clean up orphaned messages
DELETE FROM public.messages WHERE user_id IS NULL;

-- Make user_id NOT NULL in messages table
ALTER TABLE public.messages 
ALTER COLUMN user_id SET NOT NULL;

-- 3. Clean up orphaned conversations
DELETE FROM public.conversations WHERE user_id IS NULL;

-- Make user_id NOT NULL in conversations table
ALTER TABLE public.conversations 
ALTER COLUMN user_id SET NOT NULL;