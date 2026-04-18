import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tier-based system prompts. Higher tiers ask the model to think more rigorously
// and produce more complete, production-ready output.
const TIER_INSTRUCTIONS: Record<string, string> = {
  lite: `You are a helpful coding assistant. Produce concise, working code with brief explanations. Optimize for speed of answer.`,
  standard: `You are an expert software engineer. Produce complete, working code with sensible architecture and short rationale. Use idiomatic patterns for the chosen language/framework. Include error handling for likely failure paths.`,
  pro: `You are a senior software engineer. Plan briefly, then deliver production-ready code:
- Strong typing where applicable
- Clean separation of concerns across multiple files when useful
- Proper error handling, input validation, and edge cases
- Brief tests or usage examples when helpful
- Security and performance considerations called out`,
  expert: `You are a principal-level software engineer. Operate with maximum rigor:
- Begin with a short architectural plan (data model, modules, contracts)
- Deliver production-ready, multi-file code with clear separation of concerns
- Include comprehensive error handling, input validation, observability hooks, and security considerations
- Provide tests (unit-level) and document non-obvious decisions
- Call out trade-offs explicitly
- Self-review for bugs before responding`,
};

const CODE_MODE_PREFIX = `You are operating in CODE MODE.

OUTPUT FORMAT — STRICT:
1. A short plan (1-5 bullets) describing what you'll build.
2. Then for EVERY file you create or modify, use a fenced code block with this exact header format:

\`\`\`<language> path=<relative/path/to/file.ext>
<file contents>
\`\`\`

Examples of valid headers:
\`\`\`tsx path=src/App.tsx
\`\`\`python path=app/main.py
\`\`\`json path=package.json

Rules:
- ALWAYS include path=<...> on every code block you intend to be saved.
- Use forward slashes in paths.
- Output the FULL file contents, not snippets or diffs (unless the user explicitly asks for a diff).
- After all files, add a short "Next steps" section if relevant.

`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, tier = "standard", existingFiles = [] } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenRouter API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tierKey = (tier as string).toLowerCase();
    const tierInstruction = TIER_INSTRUCTIONS[tierKey] || TIER_INSTRUCTIONS.standard;

    let systemContent = CODE_MODE_PREFIX + tierInstruction;

    if (existingFiles.length > 0) {
      const fileSummary = existingFiles
        .map((f: { path: string; language: string; content: string }) => {
          const preview = (f.content || "").slice(0, 800);
          return `--- FILE: ${f.path} (${f.language}) ---\n${preview}${f.content && f.content.length > 800 ? "\n... [truncated]" : ""}`;
        })
        .join("\n\n");
      systemContent += `\n\nCURRENT WORKSPACE FILES (you may modify these by re-emitting them):\n\n${fileSummary}`;
    }

    const fullMessages = [{ role: "system", content: systemContent }, ...messages];

    // Fallback chain — same models as openrouter-chat
    const FALLBACKS = [
      "openai/gpt-oss-120b:free",
      "google/gemma-4-31b-it:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
    ];

    let response: Response | null = null;
    let lastStatus = 500;
    let lastError = "";

    for (const candidate of FALLBACKS) {
      console.log(`[code-chat] tier=${tier} trying model: ${candidate}`);
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://infinity-ai-and-search.lovable.app",
          "X-Title": "Infinity AI Code Mode",
        },
        body: JSON.stringify({
          model: candidate,
          messages: fullMessages,
          stream: true,
          temperature: tierKey === "expert" ? 0.2 : tierKey === "pro" ? 0.3 : 0.5,
          max_tokens: tierKey === "expert" ? 4000 : tierKey === "pro" ? 3000 : 2000,
        }),
      });

      if (r.ok) {
        response = r;
        break;
      }

      lastStatus = r.status;
      lastError = await r.text();
      console.warn(`[code-chat] ${candidate} failed (${r.status}), trying next...`);
      if (![404, 410, 429, 500, 502, 503].includes(r.status)) break;
    }

    if (!response) {
      console.error("[code-chat] All fallbacks exhausted:", lastStatus, lastError);
      return new Response(
        JSON.stringify({
          error:
            lastStatus === 429
              ? "All free models are rate-limited right now. Please wait a minute and try again."
              : `Code Mode error: ${lastStatus}`,
        }),
        {
          status: lastStatus,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("[code-chat] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
