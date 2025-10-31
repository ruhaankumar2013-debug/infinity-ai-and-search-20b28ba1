import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const CLOUDFLARE_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN');

    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
      throw new Error('Cloudflare credentials not configured');
    }

    console.log('[openchat] Starting request to Mistral 7B...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch knowledge entries
    const { data: knowledgeEntries, error: dbError } = await supabase
      .from('knowledge_entries')
      .select('*')
      .order('created_at', { ascending: true });

    if (dbError) {
      console.error('[openchat] Error fetching knowledge:', dbError);
    }

    // Build knowledge base context
    let knowledgeContext = '';
    if (knowledgeEntries && knowledgeEntries.length > 0) {
      knowledgeContext = '\n\nKnowledge Base:\n' + knowledgeEntries
        .map((entry: any) => `[${entry.title}]\n${entry.content}`)
        .join('\n\n');
    }

    // System prompt with knowledge
    const systemPrompt = `You are an intelligent AI assistant. You must always provide a helpful answer. First, search thoroughly through the knowledge base below for relevant information. If the answer is in the knowledge base, use it. If not found in the knowledge base, use your general knowledge to provide the best possible answer. Never say you don't know - always provide useful information.${knowledgeContext}`;

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    console.log('[openchat] Calling Cloudflare Workers AI Mistral 7B...');

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: '@cf/mistral/mistral-7b-instruct-v0.1',
          messages: chatMessages,
          stream: false,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[openchat] Mistral 7B error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Cloudflare Workers AI error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const aiResponse = result.result?.response || result.choices?.[0]?.message?.content || 'No response';

    console.log('[openchat] Sending response back to client...');

    return new Response(
      JSON.stringify({ response: aiResponse }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[openchat] Chat error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});