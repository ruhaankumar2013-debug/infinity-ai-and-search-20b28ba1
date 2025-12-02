import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, type = "search" } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "query must be a non-empty string", results: [] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[web-search] Performing ${type} for:`, query);

    if (type === "search") {
      const results: SearchResult[] = [];
      
      // Try DuckDuckGo HTML interface
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      console.log("[web-search] Fetching:", searchUrl);

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });

      if (!response.ok) {
        console.error("[web-search] DuckDuckGo error:", response.status);
        return new Response(
          JSON.stringify({ error: `Search failed: ${response.status}`, results: [] }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const html = await response.text();
      console.log("[web-search] HTML length:", html.length);

      // Strategy 1: Parse result blocks with class="result"
      const resultBlockRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*result|<\/body|$)/gi;
      let blockMatches = [...html.matchAll(resultBlockRegex)];
      
      console.log(`[web-search] Strategy 1: Found ${blockMatches.length} result blocks`);

      for (const match of blockMatches) {
        if (results.length >= 10) break;
        const block = match[1];

        // Extract link with class result__a or similar
        const linkRegex = /<a[^>]*class="[^"]*result[^"]*a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
        const linkMatch = block.match(linkRegex);
        
        if (!linkMatch) continue;

        let url = linkMatch[1];
        // Extract actual URL from DuckDuckGo redirect
        const uddgMatch = url.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          url = decodeURIComponent(uddgMatch[1]);
        }

        // Skip DuckDuckGo internal links
        if (url.includes("duckduckgo.com") || !url.startsWith("http")) continue;

        const title = linkMatch[2].replace(/<[^>]*>/g, "").trim();
        if (!title) continue;

        // Extract snippet
        const snippetRegex = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i;
        const snippetMatch = block.match(snippetRegex);
        const snippet = snippetMatch 
          ? snippetMatch[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
          : "";

        results.push({ title, url, snippet });
      }

      // Strategy 2: Fallback - find all links with uddg parameter
      if (results.length === 0) {
        console.log("[web-search] Strategy 2: Parsing uddg links...");
        const linkRegex = /<a[^>]*href="[^"]*uddg=([^"&]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        const linkMatches = [...html.matchAll(linkRegex)];
        
        console.log(`[web-search] Strategy 2: Found ${linkMatches.length} uddg links`);

        for (const match of linkMatches) {
          if (results.length >= 10) break;
          
          const url = decodeURIComponent(match[1]);
          if (url.includes("duckduckgo.com") || !url.startsWith("http")) continue;

          const title = match[2].replace(/<[^>]*>/g, "").trim();
          if (!title || title.length < 3) continue;

          // Avoid duplicates
          if (results.some(r => r.url === url)) continue;

          results.push({ title, url, snippet: "" });
        }
      }

      // Strategy 3: Super fallback - extract any external links
      if (results.length === 0) {
        console.log("[web-search] Strategy 3: Extracting all external links...");
        const allLinksRegex = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const allLinks = [...html.matchAll(allLinksRegex)];
        
        for (const match of allLinks) {
          if (results.length >= 10) break;
          
          const url = match[1];
          if (url.includes("duckduckgo.com")) continue;

          const title = match[2].replace(/<[^>]*>/g, "").trim();
          if (!title || title.length < 3) continue;
          if (results.some(r => r.url === url)) continue;

          results.push({ title, url, snippet: "" });
        }
      }

      console.log(`[web-search] Final result count: ${results.length}`);
      
      if (results.length > 0) {
        console.log("[web-search] First result:", results[0]);
      }

      return new Response(
        JSON.stringify({ results, query }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read mode - fetch and extract text from URL
    if (type === "read") {
      console.log("[web-search] Reading URL:", query);
      
      const pageResponse = await fetch(query, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!pageResponse.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch URL: ${pageResponse.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pageHtml = await pageResponse.text();
      const textContent = pageHtml
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);

      return new Response(
        JSON.stringify({ content: textContent, type: "read", query }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid type parameter", results: [] }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("[web-search] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", results: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
