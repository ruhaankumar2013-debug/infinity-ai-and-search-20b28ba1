-- Add LLaMA-3 models via Ollama
INSERT INTO public.models (name, display_name, model_id, type, description, parameters, is_active, license)
VALUES 
  (
    'llama-3-8b',
    'LLaMA-3 8B',
    '@ollama/llama3:8b',
    'text-generation',
    'Meta''s LLaMA-3 8B model running locally via Ollama. Fast and efficient for chatbots and general AI tasks. Free for commercial use.',
    '8B',
    true,
    'Meta License'
  ),
  (
    'llama-3-70b',
    'LLaMA-3 70B',
    '@ollama/llama3:70b',
    'text-generation',
    'Meta''s LLaMA-3 70B model running locally via Ollama. Excellent reasoning and advanced language understanding. Free for commercial use.',
    '70B',
    true,
    'Meta License'
  );