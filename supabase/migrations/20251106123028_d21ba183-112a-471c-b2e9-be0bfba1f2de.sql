-- Extend the type check constraint to support image generation models
ALTER TABLE public.models DROP CONSTRAINT IF EXISTS models_type_check;

ALTER TABLE public.models ADD CONSTRAINT models_type_check 
CHECK (type IN ('text-generation', 'image-generation', 'feature-extraction', 'image-classification'));