-- Create models table for Apache 2.0 AI models
CREATE TABLE public.models (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  model_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('text-generation', 'embedding', 'vision')),
  description text,
  license text NOT NULL DEFAULT 'Apache-2.0',
  parameters text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read models
CREATE POLICY "Anyone can read models"
ON public.models FOR SELECT
USING (true);

-- Only admins can manage models
CREATE POLICY "Only admins can insert models"
ON public.models FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update models"
ON public.models FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete models"
ON public.models FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add model_id to knowledge_entries
ALTER TABLE public.knowledge_entries
ADD COLUMN model_id uuid REFERENCES public.models(id) ON DELETE SET NULL;

-- Add model_id to conversations
ALTER TABLE public.conversations
ADD COLUMN model_id uuid REFERENCES public.models(id) ON DELETE SET NULL;

-- Insert default Apache 2.0 models
INSERT INTO public.models (name, display_name, model_id, type, description, parameters) VALUES
('phi-3-mini', 'Phi-3 Mini', 'onnx-community/Phi-3-mini-4k-instruct', 'text-generation', 'Microsoft Phi-3 Mini (3.8B) - Excellent reasoning in small package', '3.8B'),
('smollm-135m', 'SmolLM 135M', 'HuggingFaceTB/SmolLM-135M-Instruct', 'text-generation', 'Hugging Face SmolLM (135M) - Ultra fast and efficient', '135M'),
('smollm-360m', 'SmolLM 360M', 'HuggingFaceTB/SmolLM-360M-Instruct', 'text-generation', 'Hugging Face SmolLM (360M) - Balanced speed and capability', '360M'),
('qwen2-0.5b', 'Qwen2 0.5B', 'onnx-community/Qwen2-0.5B-Instruct', 'text-generation', 'Alibaba Qwen2 (500M) - Multilingual support', '500M'),
('tinyllama', 'TinyLlama', 'onnx-community/TinyLlama-1.1B-Chat-v1.0', 'text-generation', 'TinyLlama (1.1B) - Efficient general purpose', '1.1B'),
('bge-small', 'BGE Small', 'Xenova/bge-small-en-v1.5', 'embedding', 'BGE embeddings for semantic search', 'embeddings'),
('mobilenet-v4', 'MobileNetV4', 'onnx-community/mobilenetv4_conv_small.e2400_r224_in1k', 'vision', 'Image classification model', 'vision');