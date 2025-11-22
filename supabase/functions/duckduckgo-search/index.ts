import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    
    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Searching DuckDuckGo for:', query);

    // Use DuckDuckGo's HTML interface (Lite version)
    const searchUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo returned status ${response.status}`);
    }

    const html = await response.text();
    
    // Parse HTML results
    const results: SearchResult[] = [];
    
    // Simple regex-based parsing of DuckDuckGo Lite HTML
    // Format: <a rel="nofollow" class="result-link" href="URL">Title</a>
    const linkRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
    const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([^<]*)/g;
    
    let linkMatch;
    let snippetMatch;
    const snippets: string[] = [];
    
    // Extract snippets first
    while ((snippetMatch = snippetRegex.exec(html)) !== null) {
      snippets.push(snippetMatch[1].trim());
    }
    
    let index = 0;
    while ((linkMatch = linkRegex.exec(html)) !== null && index < 10) {
      const url = linkMatch[1];
      const title = linkMatch[2];
      const snippet = snippets[index] || '';
      
      results.push({
        title: title.trim(),
        url: url,
        snippet: snippet,
      });
      index++;
    }

    console.log(`Found ${results.length} results`);

    return new Response(
      JSON.stringify({ results }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in DuckDuckGo search:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
