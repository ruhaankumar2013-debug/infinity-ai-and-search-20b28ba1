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

    // Use DuckDuckGo's HTML interface
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
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
    
    // Parse HTML results
    const results: SearchResult[] = [];
    
    // DuckDuckGo HTML structure uses divs with class "result"
    const resultRegex = /<div class="result[^"]*">(.*?)<\/div>[\s\S]*?(?=<div class="result|$)/gi;
    const matches = html.matchAll(resultRegex);
    
    for (const match of matches) {
      if (results.length >= 10) break;
      
      const resultHtml = match[0];
      
      // Extract title and URL
      const linkMatch = resultHtml.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/s);
      if (!linkMatch) continue;
      
      let url = linkMatch[1];
      // DuckDuckGo uses redirect URLs, extract the actual URL
      const urlMatch = url.match(/uddg=([^&]+)/);
      if (urlMatch) {
        url = decodeURIComponent(urlMatch[1]);
      }
      
      const title = linkMatch[2].replace(/<[^>]*>/g, '').trim();
      
      // Extract snippet
      const snippetMatch = resultHtml.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/s);
      let snippet = '';
      if (snippetMatch) {
        snippet = snippetMatch[1].replace(/<[^>]*>/g, '').trim();
      }
      
      // Skip invalid results
      if (!url || !title || url.includes('duckduckgo.com')) continue;
      
      results.push({
        title: title,
        url: url,
        snippet: snippet,
      });
    }

    // Fallback: try alternate parsing if no results found
    if (results.length === 0) {
      console.log('Trying alternate parsing method');
      const linkRegex = /<a[^>]*class="result__url"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs;
      const titleRegex = /<h2[^>]*class="result__title"[^>]*>.*?<a[^>]*>(.*?)<\/a>/gs;
      
      const links: string[] = [];
      const titles: string[] = [];
      
      let linkMatch;
      while ((linkMatch = linkRegex.exec(html)) !== null && links.length < 10) {
        let url = linkMatch[1];
        const urlMatch = url.match(/uddg=([^&]+)/);
        if (urlMatch) {
          url = decodeURIComponent(urlMatch[1]);
        }
        if (url && !url.includes('duckduckgo.com')) {
          links.push(url);
        }
      }
      
      let titleMatch;
      while ((titleMatch = titleRegex.exec(html)) !== null && titles.length < 10) {
        const title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
        if (title) {
          titles.push(title);
        }
      }
      
      const minLength = Math.min(links.length, titles.length, 10);
      for (let i = 0; i < minLength; i++) {
        results.push({
          title: titles[i],
          url: links[i],
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
