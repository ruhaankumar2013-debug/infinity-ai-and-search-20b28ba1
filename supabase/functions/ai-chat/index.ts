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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Initializing Lovable AI (Gemini 2.5 Flash) request...');

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
    const systemPrompt = `You are an intelligent AI assistant. You have been trained with custom knowledge. Use the knowledge base provided below to answer questions accurately. If the information is in the knowledge base, cite it. If not, use your general knowledge but mention that it's not from the custom knowledge base.${knowledgeContext}`;

    // Prepare messages for Lovable AI
    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    console.log('Calling Lovable AI Gateway with Gemini 2.5 Flash...');

    // Call Lovable AI Gateway
    const response = await fetch(
      'https://ai.gateway.lovable.dev/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: chatMessages,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required, please add funds to your Lovable AI workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `Lovable AI error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully connected to Lovable AI, streaming response...');

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