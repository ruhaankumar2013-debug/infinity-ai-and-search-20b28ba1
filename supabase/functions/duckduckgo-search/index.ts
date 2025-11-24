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

    // Use DuckDuckGo's lite HTML interface for more reliable parsing
    const searchUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo returned status ${response.status}`);
    }

    const html = await response.text();
    console.log('Received HTML, length:', html.length);
    
    // Parse HTML results - DuckDuckGo Lite uses simpler table structure
    const results: SearchResult[] = [];
    
    // Match table rows containing search results
    const rowRegex = /<tr>[\s\S]*?<td[^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*class=["']result-link["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<td[^>]*class=["']result-snippet["'][^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
    
    let match;
    while ((match = rowRegex.exec(html)) !== null && results.length < 10) {
      let url = match[1];
      const title = match[2].replace(/<[^>]*>/g, '').trim();
      const snippet = match[3].replace(/<[^>]*>/g, '').trim();
      
      // Decode URL if it's encoded
      if (url.includes('//duckduckgo.com/l/?')) {
        const uddgMatch = url.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          url = decodeURIComponent(uddgMatch[1]);
        }
      }
      
      // Skip invalid results
      if (!url || !title || url.includes('duckduckgo.com/y.js')) continue;
      
      results.push({
        title: title,
        url: url,
        snippet: snippet || '',
      });
    }

    // If no results, try simpler link extraction
    if (results.length === 0) {
      console.log('Trying alternate parsing method');
      
      // Look for any links in result tables
      const simpleLinkRegex = /<a[^>]*class=["']?result-link["']?[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
      
      let linkMatch;
      while ((linkMatch = simpleLinkRegex.exec(html)) !== null && results.length < 10) {
        let url = linkMatch[1];
        const title = linkMatch[2].replace(/<[^>]*>/g, '').trim();
        
        // Decode URL
        if (url.includes('uddg=')) {
          const uddgMatch = url.match(/uddg=([^&]+)/);
          if (uddgMatch) {
            url = decodeURIComponent(uddgMatch[1]);
          }
        }
        
        // Skip invalid URLs
        if (!url || !title || url.includes('duckduckgo.com') || url.startsWith('/')) continue;
        
        results.push({
          title: title,
          url: url,
          snippet: '',
        });
      }
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
