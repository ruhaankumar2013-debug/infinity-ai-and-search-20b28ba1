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

    // Map internal model names to ordered fallback chains of OpenRouter IDs
    const FALLBACK_CHAINS: Record<string, string[]> = {
      'gpt-oss-120b': [
        'openai/gpt-oss-120b:free',
        'google/gemma-4-31b-it:free',
        'nvidia/nemotron-3-super-120b-a12b:free',
      ],
      'gemma-4-31b': [
        'google/gemma-4-31b-it:free',
        'google/gemma-3-27b-it:free',
        'openai/gpt-oss-120b:free',
      ],
      'nemotron-3-super': [
        'nvidia/nemotron-3-super-120b-a12b:free',
        'nvidia/nemotron-nano-9b-v2:free',
        'openai/gpt-oss-120b:free',
      ],
    };

    const normalizedKey = model.replace('@openrouter/', '');
    const candidates = FALLBACK_CHAINS[normalizedKey] || [model];

    let response: Response | null = null;
    let lastStatus = 500;
    let lastError = '';

    for (const candidate of candidates) {
      console.log(`[openrouter-chat] Trying model: ${candidate}`);
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://infinity-ai-and-search.lovable.app',
          'X-Title': 'Infinity AI',
        },
        body: JSON.stringify({
          model: candidate,
          messages,
          stream,
          temperature: 0.7,
          max_tokens: 1500,
        }),
      });

      if (r.ok) {
        response = r;
        break;
      }

      lastStatus = r.status;
      lastError = await r.text();
      console.warn(`[openrouter-chat] Model ${candidate} failed (${r.status}), trying next...`);

      // Only fall through on availability errors
      if (![404, 410, 429, 500, 502, 503].includes(r.status)) break;
    }

    if (!response) {
      console.error('[openrouter-chat] All fallbacks exhausted:', lastStatus, lastError);
      if (lastStatus === 429) {
        return new Response(
          JSON.stringify({ error: 'All free models are rate-limited right now. Please wait a minute and try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (lastStatus === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your OpenRouter account.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: `OpenRouter error: ${lastStatus}` }),
        { status: lastStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
