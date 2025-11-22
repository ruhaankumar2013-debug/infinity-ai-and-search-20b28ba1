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
    
    // Parse HTML results - DuckDuckGo Lite uses a table structure
    const results: SearchResult[] = [];
    
    // Split by result rows (each result is in a table row)
    const rows = html.split('<tr>');
    
    for (let i = 0; i < rows.length && results.length < 10; i++) {
      const row = rows[i];
      
      // Extract link and title - look for the main result link
      const linkMatch = row.match(/<a[^>]*href="([^"]+)"[^>]*class="result-link"[^>]*>(.*?)<\/a>/s);
      if (!linkMatch) continue;
      
      let url = linkMatch[1];
      let title = linkMatch[2].replace(/<[^>]*>/g, '').trim();
      
      // Extract snippet - look for the result snippet
      const snippetMatch = row.match(/<td[^>]*class="result-snippet"[^>]*>(.*?)<\/td>/s);
      let snippet = '';
      if (snippetMatch) {
        snippet = snippetMatch[1].replace(/<[^>]*>/g, '').trim();
      }
      
      // Skip if no valid URL or title
      if (!url || !title || url.includes('duckduckgo.com')) continue;
      
      results.push({
        title: title,
        url: url,
        snippet: snippet,
      });
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
