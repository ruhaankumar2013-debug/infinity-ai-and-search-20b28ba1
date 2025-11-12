-- Add GPT-OSS-120B model using OpenAI
INSERT INTO public.models (name, display_name, model_id, type, description, parameters, is_active)
VALUES (
  'gpt-oss-120b',
  'GPT-OSS-120B',
  'gpt-4o',
  'text-generation',
  'Large-scale open-source model powered by OpenAI for advanced reasoning and generation tasks',
  '120B',
  true
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  model_id = EXCLUDED.model_id,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;