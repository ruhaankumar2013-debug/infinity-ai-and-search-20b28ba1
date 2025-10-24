-- Create knowledge base table for admin to teach the AI
CREATE TABLE IF NOT EXISTS public.knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual', -- 'manual' or 'file'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create chat messages table for conversation history
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies - public access for chat
CREATE POLICY "Anyone can read knowledge entries"
  ON public.knowledge_entries FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert knowledge entries"
  ON public.knowledge_entries FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update knowledge entries"
  ON public.knowledge_entries FOR UPDATE
  TO public
  USING (true);

CREATE POLICY "Anyone can delete knowledge entries"
  ON public.knowledge_entries FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Anyone can read chat messages"
  ON public.chat_messages FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert chat messages"
  ON public.chat_messages FOR INSERT
  TO public
  WITH CHECK (true);

-- Create function for automatic updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.knowledge_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();