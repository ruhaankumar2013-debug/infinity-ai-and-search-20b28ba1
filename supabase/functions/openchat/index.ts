// @ts-nocheck
// This file runs on Deno runtime (Supabase Edge Functions), not Node.js
// TypeScript errors here are expected and don't affect runtime functionality
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Feature flag: enable or disable server-side web search enrichment.
// Disabling this makes initial responses start faster.
const ENABLE_WEB_SURFING_ENRICHMENT = false;

// Input validation
const validateInput = (data: any) => {
  const errors: string[] = [];

  // Validate messages array
  if (!Array.isArray(data.messages)) {
    errors.push("messages must be an array");
  } else if (data.messages.length === 0) {
    errors.push("messages array cannot be empty");
  } else if (data.messages.length > 100) {
    errors.push("messages array cannot exceed 100 messages");
  } else {
    for (const msg of data.messages) {
      if (!msg.role || !msg.content) {
        errors.push("each message must have role and content");
        break;
      }
      if (typeof msg.content !== 'string' || msg.content.length > 10000) {
        errors.push("message content must be string with max 10,000 characters");
        break;
      }
    }
  }

  // Validate modelName
  if (data.modelName && typeof data.modelName !== 'string') {
    errors.push("modelName must be a string");
  } else if (data.modelName && data.modelName.length > 100) {
    errors.push("modelName cannot exceed 100 characters");
  } else if (data.modelName && !data.modelName.match(/^@(groq|cf)\//)) {
    errors.push("modelName must start with @groq/ or @cf/");
  }

  // Validate modelId (must be valid UUID, model_id string like @cf/..., or null)
  if (data.modelId && typeof data.modelId !== 'string') {
    errors.push("modelId must be a string");
  } else if (data.modelId && !data.modelId.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|@[a-z]+\/[^/]+(\/[^/]+)*)$/i)) {
    errors.push("modelId must be a valid UUID or model_id string (e.g., @cf/model-name)");
  }

  // Validate boolean flags
  if (data.researchMode !== undefined && typeof data.researchMode !== 'boolean') {
    errors.push("researchMode must be a boolean");
  }
  if (data.studyMode !== undefined && typeof data.studyMode !== 'boolean') {
    errors.push("studyMode must be a boolean");
  }
  if (data.webSurfingMode !== undefined && typeof data.webSurfingMode !== 'boolean') {
    errors.push("webSurfingMode must be a boolean");
  }

  if (data.stream !== undefined && typeof data.stream !== 'boolean') {
    errors.push("stream must be a boolean");
  }

  return errors;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData = await req.json();
    
    // Validate input
    const validationErrors = validateInput(requestData);
    if (validationErrors.length > 0) {
      console.error('[openchat] Validation errors:', validationErrors);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validationErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let { messages, modelId, modelName, researchMode, studyMode, webSurfingMode, stream = true } = requestData;
    
    // GPT-OSS-120B uses Responses API which doesn't support streaming
    if (modelName === '@cf/openai/gpt-oss-120b') {
      stream = false;
    }
    
    // Determine which API to use based on model prefix
    const isGroqModel = modelName?.startsWith('@groq/');
    const isCloudflareModel = modelName?.startsWith('@cf/');
    
    if (isGroqModel) {
      const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
      if (!GROQ_API_KEY) {
        throw new Error('Groq API key not configured');
      }
    } else if (isCloudflareModel) {
      const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
      const CLOUDFLARE_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN');
      if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
        return new Response(
          JSON.stringify({ error: 'Cloudflare credentials not configured. Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      throw new Error('Unsupported model type');
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

    // System prompt with knowledge - enhanced for research mode, study mode, and web surfing mode
    let basePrompt = '';
    
    if (webSurfingMode) {
      basePrompt = `You are an AI assistant with Web Surfing Mode enabled. You have REAL web browsing capability through the web_search function.

CAPABILITIES:
- You can search the web in real-time using web_search(query, type='search')
- You can read specific URLs using web_search(url, type='read')
- Search results are returned in clean markdown format
- You can access current information, news, and real-time data

WHEN TO USE WEB SEARCH:
1. Current events, news, or recent information
2. Real-time data (weather, stock prices, sports scores)
3. Specific facts that may have changed since your training
4. Information about recent products, services, or technologies
5. When users explicitly ask you to "search the web" or "look up"

HOW TO USE:
- For general searches: Use web_search with type='search' and a clear search query
- For specific URLs: Use web_search with type='read' and the full URL
- Always inform users when you're searching the web
- Cite the sources of your information when using web search results

IMPORTANT:
- First check the knowledge base below for relevant information
- Only search the web when knowledge base doesn't have the answer or when current information is needed
- Be transparent about when you're using web search vs your training data
- Summarize search results clearly and cite sources

First, check the knowledge base below for relevant information.${knowledgeContext}

AVAILABLE TOOL:
- web_search(query: string, type: 'search' | 'read'): Searches the web or reads a URL, returns markdown content`;
    } else if (studyMode) {
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

    // Enhanced message handling for web surfing mode
    let enrichedMessages = [...messages];
    
    // Optional: in web surfing mode, automatically perform a web search on the latest user message.
    // Disabled by default for faster initial responses.
    if (ENABLE_WEB_SURFING_ENRICHMENT && webSurfingMode && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'user' && typeof lastMessage.content === 'string' && lastMessage.content.trim().length > 5) {
        try {
          console.log('[openchat] Web Surfing Mode enabled – calling web-search function...');
          const { data: searchData, error: searchError } = await supabase.functions.invoke('web-search', {
            body: {
              query: lastMessage.content,
              type: 'search',
            },
          });

          if (searchError) {
            console.error('[openchat] Web search error:', searchError);
          } else if (searchData?.content) {
            console.log('[openchat] Web search successful, adding context to messages');
            enrichedMessages.push({
              role: 'system',
              content: `[WEB SEARCH RESULTS]\n${searchData.content.substring(0, 4000)}\n[END OF WEB SEARCH RESULTS]\n\nUse the above web search results to answer the user's question. Cite sources when appropriate.`,
            });
          } else {
            console.log('[openchat] Web search returned no content');
          }
        } catch (e) {
          console.error('[openchat] Error calling web-search:', e);
        }
      }
    }

    const chatMessages = [
      { role: 'system', content: basePrompt },
      ...enrichedMessages,
    ];

    let response;
    
    if (isGroqModel) {
      // Groq API call with streaming
      console.log(`[openchat] Calling Groq API with ${modelName} (streaming)...`);
      const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
      
      // Extract actual model name (remove @groq/ prefix)
      const groqModelName = modelName.replace('@groq/', '');
      
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: groqModelName,
          messages: chatMessages,
          temperature: 0.7,
          max_tokens: 8192,
          stream,
        }),
      });
    } else {
      // Cloudflare Workers AI
      console.log(`[openchat] Calling Cloudflare Workers AI ${modelName}...`);
      const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
      const CLOUDFLARE_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN');
      
      // GPT-OSS-120B uses /ai/run endpoint (Responses API format, no streaming support)
      if (modelName === '@cf/openai/gpt-oss-120b') {
        // ============================================
        // ISOLATION TEST: Hardcoded minimal request
        // ============================================
        // This test IGNORES all chat history and uses a hardcoded prompt
        // If THIS fails, the problem is NOT prompt formatting
        const ISOLATION_TEST = true; // Set to false to use real chat messages
        
        let conversationText;
        let maxTokens;
        
        if (ISOLATION_TEST) {
          // HARDCODED TEST PROMPT - NO CHAT HISTORY
          conversationText = "Assistant: Say the word SUCCESS in all caps.";
          maxTokens = 64;
          console.log('[openchat] GPT-OSS-120B ISOLATION TEST MODE: Using hardcoded prompt');
        } else {
          // Build conversation context for GPT-OSS-120B with capitalized role prefixes
          // Format: System:, User:, Assistant: (capitalized as required by Responses API)
          conversationText = chatMessages
            .map(m => {
              const role = m.role.charAt(0).toUpperCase() + m.role.slice(1);
              return `${role}: ${m.content}`;
            })
            .join('\n');
          
          // Ensure prompt ends with "Assistant:" to trigger generation (must be on its own line)
          const lines = conversationText.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          if (!lastLine.trim().startsWith('Assistant:')) {
            conversationText += '\nAssistant:';
          }
          maxTokens = 512;
        }
        
        const requestUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/openai/gpt-oss-120b`;
        const requestBody = {
          input: conversationText,
          max_output_tokens: maxTokens
        };
        
        // COMPREHENSIVE REQUEST LOGGING
        console.log('========================================');
        console.log('[openchat] GPT-OSS-120B RAW FETCH TEST');
        console.log('========================================');
        console.log('[openchat] Request URL:', requestUrl);
        console.log('[openchat] Request Method: POST');
        console.log('[openchat] Request Headers:', {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN ? CLOUDFLARE_API_TOKEN.substring(0, 20) + '...' : 'MISSING'}`,
          'Content-Type': 'application/json'
        });
        console.log('[openchat] Request Body (EXACT):', JSON.stringify(requestBody, null, 2));
        console.log('[openchat] Stream enabled:', false);
        console.log('[openchat] Account ID present:', !!CLOUDFLARE_ACCOUNT_ID);
        console.log('[openchat] API Token present:', !!CLOUDFLARE_API_TOKEN);
        console.log('========================================');
        
        try {
          response = await fetch(requestUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });
          
          console.log('[openchat] Fetch completed. Response status:', response.status);
          console.log('[openchat] Response ok:', response.ok);
          console.log('[openchat] Response headers:', Object.fromEntries(response.headers.entries()));
        } catch (fetchError) {
          console.error('[openchat] FETCH ERROR (network/fetch failed):', fetchError);
          return new Response(
            JSON.stringify({ 
              error: `Network error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
              details: 'The fetch call to Cloudflare API failed. Check network connectivity and API credentials.'
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        // Standard chat completions format for other models with streaming
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
              stream,
            }),
          }
        );
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[openchat] ${modelName} HTTP error status:`, response.status);
      console.error(`[openchat] ${modelName} error response body:`, errorText);
      const apiName = isGroqModel ? 'Groq API' : 'Cloudflare Workers AI';
      let errorMessage = `${apiName} error: HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.errors?.[0]?.message || errorJson.error || errorJson.message || errorMessage;
      } catch {
        if (errorText) {
          errorMessage = errorText.length > 200 ? errorText.substring(0, 200) : errorText;
        }
      }
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Non-streaming mode: return a single JSON response for easier use in Study Mode, etc.
    if (!stream) {
      let json;
      let responseText;
      
      try {
        responseText = await response.text();
        console.log('========================================');
        console.log('[openchat] RAW RESPONSE TEXT (first 2000 chars):', responseText.substring(0, 2000));
        console.log('[openchat] Response text length:', responseText.length);
        console.log('========================================');
        
        try {
          json = JSON.parse(responseText);
          console.log('[openchat] Parsed JSON successfully');
        } catch (parseError) {
          console.error('[openchat] JSON PARSE ERROR:', parseError);
          return new Response(
            JSON.stringify({ 
              error: `Invalid JSON response from Cloudflare. Raw response: ${responseText.substring(0, 500)}`,
              details: 'The API returned non-JSON data. This may indicate an authentication or endpoint error.'
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (readError) {
        console.error('[openchat] RESPONSE READ ERROR:', readError);
        return new Response(
          JSON.stringify({ 
            error: `Failed to read response: ${readError instanceof Error ? readError.message : String(readError)}`,
            details: 'Could not read the response body from Cloudflare API.'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('[openchat] Non-streaming response HTTP status:', response.status);
      console.log('[openchat] Non-streaming response full JSON:', JSON.stringify(json, null, 2));

      // GPT-OSS-120B uses /ai/run endpoint which returns { result: { response: string } } or { result: { output_text: string } }
      // Extract content ONLY from result.response or result.output_text (strict parsing)
      let content;
      console.log('[openchat] Checking json.result:', !!json.result);
      console.log('[openchat] json.result type:', typeof json.result);
      if (json.result) {
        console.log('[openchat] json.result keys:', Object.keys(json.result));
        console.log('[openchat] json.result.response exists:', !!json.result.response);
        console.log('[openchat] json.result.output_text exists:', !!json.result.output_text);
      }
      
      if (json.result?.response) {
        content = json.result.response;
        console.log('[openchat] ✅ SUCCESS: Extracted content from json.result.response');
        console.log('[openchat] Content length:', content.length);
      } else if (json.result?.output_text) {
        content = json.result.output_text;
        console.log('[openchat] ✅ SUCCESS: Extracted content from json.result.output_text');
        console.log('[openchat] Content length:', content.length);
      } else {
        console.error('[openchat] ❌ FAILED to extract content. Full response structure:', JSON.stringify(json, null, 2));
        // Log structure for debugging
        console.error('[openchat] json.result exists:', !!json.result);
        console.error('[openchat] json.result type:', typeof json.result);
        if (json.result) {
          console.error('[openchat] json.result keys:', Object.keys(json.result));
        }
        // Return the FULL error with complete response for debugging
        return new Response(
          JSON.stringify({ 
            error: `Failed to extract response. Unexpected response format.`,
            details: `Expected json.result.response or json.result.output_text, but got: ${JSON.stringify(json, null, 2).substring(0, 2000)}`,
            fullResponse: json
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[openchat] ✅ FINAL SUCCESS: Returning content to client');
      return new Response(
        JSON.stringify({ response: content }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Streaming mode: return the provider's SSE/body directly
    const apiName = isGroqModel ? 'Groq' : 'Cloudflare';
    console.log(`[openchat] Returning ${apiName} stream to client...`);
    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    console.error('[openchat] Chat error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});