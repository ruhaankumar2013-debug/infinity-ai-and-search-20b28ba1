import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// GPT-OSS-120B via OpenRouter with streaming
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
  const { messages, model = 'openai/gpt-oss-120b:free', stream = true } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OpenRouter API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[openrouter-chat] Calling OpenRouter with model: ${model}, streaming: ${stream}`);

    // Map internal model names to OpenRouter model IDs
    let openRouterModel = model;
    if (model === 'gpt-oss-120b' || model === '@openrouter/gpt-oss-120b') {
      openRouterModel = 'openai/gpt-oss-120b:free';
    } else if (model === 'gemma-4-31b' || model === '@openrouter/gemma-4-31b') {
      openRouterModel = 'google/gemma-4-31b-it:free';
    } else if (model === 'nemotron-3-super' || model === '@openrouter/nemotron-3-super') {
      openRouterModel = 'nvidia/nemotron-3-super-120b-a12b:free';
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://infinity-ai-and-search.lovable.app',
        'X-Title': 'Infinity AI',
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages,
        stream,
        temperature: 0.7,
        max_tokens: 1500, // Reduced to work with limited credits
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[openrouter-chat] OpenRouter error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your OpenRouter account.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `OpenRouter error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (stream) {
      // Return streaming response
      return new Response(response.body, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      });
    } else {
      // Non-streaming response
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      return new Response(
        JSON.stringify({ response: content }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[openrouter-chat] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
