-- Add image_url column to messages table for image generation support
ALTER TABLE public.messages 
ADD COLUMN image_url TEXT;