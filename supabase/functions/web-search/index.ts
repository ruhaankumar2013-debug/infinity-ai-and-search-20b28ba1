import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Basic input validation
const validateInput = (data: any) => {
  const errors: string[] = [];

  if (!data.query || typeof data.query !== "string") {
    errors.push("query must be a non-empty string");
  } else if (data.query.length > 500) {
    errors.push("query cannot exceed 500 characters");
  }

  if (data.type && !["search", "read"].includes(data.type)) {
    errors.push("type must be either 'search' or 'read'");
  }

  return errors;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, type = "search" } = await req.json();

    const validationErrors = validateInput({ query, type });
    if (validationErrors.length > 0) {
      console.error("[web-search] Validation errors:", validationErrors);
      return new Response(
        JSON.stringify({ error: "Invalid input", details: validationErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[web-search] Performing ${type} for:`, query);

    if (type === "search") {
      // Use DuckDuckGo HTML interface for search
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      console.log("[web-search] Calling DuckDuckGo:", searchUrl);

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("[web-search] DuckDuckGo error:", response.status, text.slice(0, 500));
        return new Response(
          JSON.stringify({ error: `DuckDuckGo error: ${response.status}` }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const html = await response.text();
      console.log("[web-search] Received HTML length:", html.length);

      // Parse results into a markdown summary for the AI
      let content = `# Web Search Results\n\nQuery: "${query}"\n\n`;

      const resultRegex = /<div class="result[^"]*">([\s\S]*?)<\/div>[\s\S]*?(?=<div class="result|$)/gi;
      const matches = html.matchAll(resultRegex);

      let count = 0;
      for (const match of matches) {
        if (count >= 10) break;
        const block = match[1];

        const linkMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!linkMatch) continue;

        let url = linkMatch[1];
        const urlMatch = url.match(/uddg=([^&]+)/);
        if (urlMatch) {
          url = decodeURIComponent(urlMatch[1]);
        }

        const title = linkMatch[2].replace(/<[^>]*>/g, "").trim();
        if (!url || !title || url.includes("duckduckgo.com")) continue;

        const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, "").trim() : "";

        count += 1;
        content += `## [${count}] ${title}\n`;
        content += `URL: ${url}\n`;
        if (snippet) {
          content += `${snippet}\n`;
        }
        content += "\n";
      }

      if (count === 0) {
        content += "No results could be parsed from DuckDuckGo.\n";
      }

      console.log(`[web-search] Parsed ${count} results`);

      return new Response(
        JSON.stringify({ content, type: "search", query }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fallback simple reader for type === 'read' (no external paid API)
    console.log("[web-search] Simple read for URL:", query);
    const pageResponse = await fetch(query, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!pageResponse.ok) {
      const text = await pageResponse.text();
      console.error("[web-search] Read URL error:", pageResponse.status, text.slice(0, 500));
      return new Response(
        JSON.stringify({ error: `Error fetching URL: ${pageResponse.status}` }),
        { status: pageResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pageHtml = await pageResponse.text();
    console.log("[web-search] Read page length:", pageHtml.length);

    const textContent = pageHtml.replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const truncated = textContent.slice(0, 8000);

    return new Response(
      JSON.stringify({ content: truncated, type: "read", query }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[web-search] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
