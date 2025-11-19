import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation
const validateInput = (data: any) => {
  const errors: string[] = [];

  if (!data.query || typeof data.query !== 'string') {
    errors.push("query must be a non-empty string");
  } else if (data.query.length > 500) {
    errors.push("query cannot exceed 500 characters");
  }

  if (data.type && !['search', 'read'].includes(data.type)) {
    errors.push("type must be either 'search' or 'read'");
  }

  return errors;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, type = 'search' } = await req.json();
    
    // Validate input
    const validationErrors = validateInput({ query, type });
    if (validationErrors.length > 0) {
      console.error('[web-search] Validation errors:', validationErrors);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validationErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[web-search] Performing ${type} for:`, query);

    let jinaUrl: string;
    if (type === 'read') {
      // Direct URL reading
      jinaUrl = `https://r.jina.ai/${encodeURIComponent(query)}`;
    } else {
      // Web search
      jinaUrl = `https://s.jina.ai/${encodeURIComponent(query)}`;
    }

    console.log('[web-search] Calling Jina AI:', jinaUrl);

    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Return-Format': 'markdown',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[web-search] Jina AI error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Jina AI error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.text();
    console.log('[web-search] Successfully retrieved content, length:', result.length);

    return new Response(
      JSON.stringify({ 
        content: result,
        type,
        query 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[web-search] Error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
