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
    const { messages, modelId, modelName, researchMode, studyMode } = await req.json();
    const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const CLOUDFLARE_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN');

    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
      throw new Error('Cloudflare credentials not configured');
    }

    console.log(`[openchat] Starting request to ${modelName}...`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch knowledge entries filtered by model_id
    let knowledgeQuery = supabase
      .from('knowledge_entries')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (modelId) {
      knowledgeQuery = knowledgeQuery.eq('model_id', modelId);
    }
    
    const { data: knowledgeEntries, error: dbError } = await knowledgeQuery;

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

    // System prompt with knowledge - enhanced for research mode and study mode
    let basePrompt = '';
    
    if (studyMode) {
      basePrompt = `You are an expert AI study assistant and educational tutor. Your role is to help students learn effectively and create personalized study plans.

CORE CAPABILITIES:
- BREAK DOWN complex topics into digestible, easy-to-understand parts
- CREATE personalized study plans with clear timelines and milestones
- EXPLAIN concepts using analogies, examples, and different learning approaches
- PROVIDE practice questions and self-assessment tools
- SUGGEST effective study techniques (spaced repetition, active recall, etc.)
- ENCOURAGE active learning and critical thinking
- ADAPT to different learning styles and paces

WHEN CREATING STUDY PLANS:
1. Ask about the subject, available time, and learning goals
2. Structure plans with daily/weekly milestones
3. Include varied activities: reading, practice, review, testing
4. Build in spaced repetition and active recall sessions
5. Provide progress checkpoints and adjustment strategies

First, check the knowledge base below for relevant educational material. Use it to enhance your teaching and create tailored study strategies.${knowledgeContext}`;
    } else if (researchMode) {
      basePrompt = `You are an advanced AI research assistant with deep analytical capabilities. When answering questions:

1. THINK STEP-BY-STEP: Break down complex problems into logical components
2. ANALYZE THOROUGHLY: Consider multiple perspectives and implications
3. CITE EVIDENCE: Reference specific information from the knowledge base when available
4. REASON DEEPLY: Explain your thought process and reasoning
5. BE COMPREHENSIVE: Provide detailed, well-structured answers with examples
6. CONSIDER CONTEXT: Think about broader implications and related concepts

First, thoroughly search the knowledge base below for relevant information. If found, integrate it into your detailed analysis. If not found, use your extensive knowledge to provide a comprehensive, well-reasoned answer.${knowledgeContext}`;
    } else {
      basePrompt = `You are an intelligent AI assistant. You must always provide a helpful answer. First, search thoroughly through the knowledge base below for relevant information. If the answer is in the knowledge base, use it. If not found in the knowledge base, use your general knowledge to provide the best possible answer. Never say you don't know - always provide useful information.${knowledgeContext}`;
    }

    const chatMessages = [
      { role: 'system', content: basePrompt },
      ...messages,
    ];

    console.log(`[openchat] Calling Cloudflare Workers AI ${modelName}...`);

    // GPT-OSS-120B uses Responses API format
    let response;
    if (modelName === '@cf/openai/gpt-oss-120b') {
      // Build conversation context for Responses API
      const conversationText = chatMessages
        .map(m => {
          if (m.role === 'system') return `Instructions: ${m.content}`;
          if (m.role === 'user') return `User: ${m.content}`;
          if (m.role === 'assistant') return `Assistant: ${m.content}`;
          return '';
        })
        .filter(Boolean)
        .join('\n\n');
      
      console.log('[openchat] Using Responses API for GPT-OSS-120B');
      
      response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1/responses`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            input: conversationText,
          }),
        }
      );
    } else {
      // Standard chat completions format for other models
      response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            messages: chatMessages,
            stream: false,
          }),
        }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[openchat] ${modelName} error:`, response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Cloudflare Workers AI error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    console.log('[openchat] API response structure:', JSON.stringify(result).substring(0, 200));
    
    // Extract text from Responses API (gpt-oss-120b) if present
    let aiResponse = '';
    if (Array.isArray(result?.output)) {
      try {
        const msg = [...result.output].reverse().find((o: any) => o?.type === 'message');
        const txt = msg?.content?.find((c: any) => c?.type === 'output_text')?.text;
        if (typeof txt === 'string' && txt.length > 0) {
          aiResponse = txt;
        }
      } catch (e) {
        console.error('[openchat] Failed to parse Responses API output:', e);
      }
    }

    // Fallbacks for Chat Completions and other formats
    if (!aiResponse) {
      aiResponse = result.result?.response || result.response || result.choices?.[0]?.message?.content || result.text || 'No response';
    }

    if (aiResponse === 'No response') {
      console.error('[openchat] Could not extract response from result:', JSON.stringify(result));
    }

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