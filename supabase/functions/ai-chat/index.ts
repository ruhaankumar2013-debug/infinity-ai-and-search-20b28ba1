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

    console.log('Initializing OpenChat 3.5 request...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all knowledge entries from database
    const { data: knowledgeEntries, error: dbError } = await supabase
      .from('knowledge_entries')
      .select('*')
      .order('created_at', { ascending: true });

    if (dbError) {
      console.error('Error fetching knowledge:', dbError);
    }

    // Build knowledge base context
    let knowledgeContext = '';
    if (knowledgeEntries && knowledgeEntries.length > 0) {
      knowledgeContext = '\n\nKnowledge Base:\n' + knowledgeEntries
        .map(entry => `[${entry.title}]\n${entry.content}`)
        .join('\n\n');
    }

    // System prompt with knowledge
    const systemPrompt = `You are an intelligent AI assistant powered by OpenChat 3.5. You have been trained with custom knowledge. Use the knowledge base provided below to answer questions accurately. If the information is in the knowledge base, cite it. If not, use your general knowledge but mention that it's not from the custom knowledge base.${knowledgeContext}`;

    // Prepare messages for OpenChat
    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    console.log('Calling Cloudflare Workers AI with OpenChat 3.5...');

    // Call Cloudflare Workers AI with OpenChat 3.5
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: '@cf/openchat/openchat-3.5-0106',
          messages: chatMessages,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cloudflare Workers AI error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Cloudflare Workers AI error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully connected to OpenChat 3.5, streaming response...');

    // Return the stream
    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    console.error('Chat error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});