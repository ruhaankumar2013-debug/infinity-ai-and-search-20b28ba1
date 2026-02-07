-- Create table to track video generation usage
CREATE TABLE public.video_generation_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  model text NOT NULL DEFAULT 'minimax-video-01',
  prompt text
);

-- Enable RLS
ALTER TABLE public.video_generation_usage ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage
CREATE POLICY "Users can view their own video usage"
ON public.video_generation_usage
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own usage records
CREATE POLICY "Users can insert their own video usage"
ON public.video_generation_usage
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view all usage
CREATE POLICY "Admins can view all video usage"
ON public.video_generation_usage
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster weekly queries
CREATE INDEX idx_video_usage_user_week ON public.video_generation_usage (user_id, created_at);