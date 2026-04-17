-- Code workspace: per-conversation files generated/edited in Code Mode
CREATE TABLE public.code_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  path TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'plaintext',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, path)
);

CREATE INDEX idx_code_files_conversation ON public.code_files(conversation_id);
CREATE INDEX idx_code_files_user ON public.code_files(user_id);

ALTER TABLE public.code_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own code files"
  ON public.code_files FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own code files"
  ON public.code_files FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own code files"
  ON public.code_files FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own code files"
  ON public.code_files FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Reuse existing update_updated_at_column() if present, otherwise create it
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_code_files_updated_at
  BEFORE UPDATE ON public.code_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();