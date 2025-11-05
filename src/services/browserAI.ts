import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

// Note: HuggingFace token can be set via VITE_HUGGING_FACE_TOKEN env variable
// Some models may require authentication - get token from https://huggingface.co/settings/tokens
const HF_TOKEN = (import.meta as any).env?.VITE_HUGGING_FACE_TOKEN;
if (HF_TOKEN) {
  // @ts-ignore - transformers.js env allows HF_TOKEN at runtime
  (env as any).HF_TOKEN = HF_TOKEN;
}

interface TextGenerationOptions {
  model: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

interface Model {
  model_id: string;
  type: string;
}

let currentPipeline: any = null;
let currentModelId: string | null = null;

export const generateText = async (
  prompt: string,
  options: TextGenerationOptions,
  onToken?: (token: string) => void
): Promise<string> => {
  try {
    // Initialize or reuse pipeline
    if (!currentPipeline || currentModelId !== options.model) {
      console.log(`Loading model: ${options.model}`);
      
      currentPipeline = await pipeline('text-generation', options.model);
      currentModelId = options.model;
    }

    // Build prompt with system message if provided
    let fullPrompt = prompt;
    if (options.systemPrompt) {
      fullPrompt = `${options.systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`;
    }

    // Generate text
    const result = await currentPipeline(fullPrompt, {
      max_new_tokens: options.maxTokens || 256,
      temperature: options.temperature || 0.7,
      do_sample: true,
      top_k: 50,
      top_p: 0.9,
    });
    
    const generatedText = result[0].generated_text;
    
    // Remove the prompt from output to get just the response
    const response = generatedText.slice(fullPrompt.length).trim();
    
    // If streaming callback provided, send the full response at once
    if (onToken) {
      onToken(response);
    }
    
    return response;
  } catch (error) {
    console.error('Error generating text:', error);
    throw new Error(`Failed to generate text: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const generateEmbedding = async (text: string, modelId: string): Promise<number[]> => {
  try {
    const extractor = await pipeline(
      'feature-extraction',
      modelId,
      { device: 'webgpu' }
    );

    const embeddings = await extractor(text, {
      pooling: 'mean',
      normalize: true
    });

    return Array.from(embeddings.data);
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const classifyImage = async (imageUrl: string, modelId: string): Promise<any> => {
  try {
    const classifier = await pipeline(
      'image-classification',
      modelId,
      { device: 'webgpu' }
    );

    const result = await classifier(imageUrl);
    return result;
  } catch (error) {
    console.error('Error classifying image:', error);
    throw new Error(`Failed to classify image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const checkWebGPUSupport = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !(navigator as any).gpu) {
    return false;
  }
  
  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
};
