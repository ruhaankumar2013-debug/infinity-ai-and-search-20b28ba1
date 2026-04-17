import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ULTRA Router: Uses GPT-OSS-120B via OpenRouter to intelligently route prompts
const ROUTER_SYSTEM_PROMPT = `You are ULTRA, an intelligent AI orchestrator. Your ONLY job is to analyze the user's prompt and decide which model should handle it.

AVAILABLE MODELS:
1. "gpt-oss-120b" - Deep reasoning, analysis, complex questions, coding, math, planning
2. "gemma-4-31b" - Efficient mid-size reasoning, balanced quality/speed, multilingual
3. "nemotron-3-super" - NVIDIA's 120B model, strong at structured reasoning, code, and technical tasks
4. "sdxl" - Image generation (when user wants to CREATE/GENERATE/DRAW/MAKE an image)
5. "minimax-video" - Video generation (when user wants to CREATE/GENERATE/MAKE a video or animation)
6. "fast-text" - Simple chat, greetings, quick questions, casual conversation

ROUTING RULES:
- Image requests (draw, create image, generate picture, make art, visualize) → "sdxl"
- Video requests (create video, animate, make animation, generate clip) → "minimax-video"
- Heavy reasoning, deep analysis, complex math/proofs → "gpt-oss-120b"
- Technical/code/structured reasoning tasks → "nemotron-3-super"
- Balanced general questions, multilingual, mid-complexity → "gemma-4-31b"
- Simple questions, greetings, casual chat → "fast-text"
- Ambiguous/unclear prompts → "gpt-oss-120b"

RESPOND WITH ONLY THIS JSON FORMAT (no other text):
{
  "model": "<model_id>",
  "reason": "<brief reason for choice>",
  "modified_prompt": "<optional: refined prompt for the target model, or null>"
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, messages } = await req.json();
    
    if (!prompt && (!messages || messages.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'No prompt or messages provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    if (!OPENROUTER_API_KEY) {
      console.error('[ultra-router] OPENROUTER_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'OpenRouter API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userPrompt = prompt || messages[messages.length - 1]?.content || '';
    
    console.log('[ultra-router] Analyzing prompt:', userPrompt.substring(0, 100));

    // Call GPT-OSS-120B via OpenRouter for routing decision
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://infinity-ai-and-search.lovable.app',
        'X-Title': 'Infinity AI ULTRA Router',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini', // Fast, cheap model for routing decisions
        messages: [
          { role: 'system', content: ROUTER_SYSTEM_PROMPT },
          { role: 'user', content: `Analyze and route this prompt: "${userPrompt}"` }
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ultra-router] OpenRouter error:', response.status, errorText);
      // Fallback to GPT-OSS-120B on error
      return new Response(
        JSON.stringify({ 
          model: 'gpt-oss-120b',
          reason: 'Router fallback due to API error',
          modified_prompt: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('[ultra-router] Router response:', content);

    // Parse the JSON response
    try {
      // Extract JSON from response (handle potential markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      const routingDecision = JSON.parse(jsonStr);
      
      // Validate the model choice
      const validModels = ['gpt-oss-120b', 'gemma-4-31b', 'nemotron-3-super', 'sdxl', 'minimax-video', 'fast-text'];
      if (!validModels.includes(routingDecision.model)) {
        routingDecision.model = 'gpt-oss-120b';
        routingDecision.reason = 'Invalid model choice, defaulting to reasoning model';
      }

      console.log('[ultra-router] Routing decision:', routingDecision);
      
      return new Response(
        JSON.stringify(routingDecision),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (parseError) {
      console.error('[ultra-router] Failed to parse routing decision:', parseError);
      // Default to GPT-OSS-120B
      return new Response(
        JSON.stringify({ 
          model: 'gpt-oss-120b',
          reason: 'Parse error, defaulting to reasoning model',
          modified_prompt: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[ultra-router] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
