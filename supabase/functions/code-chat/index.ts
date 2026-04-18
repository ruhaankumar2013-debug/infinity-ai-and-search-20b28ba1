import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tier-based system prompts.
const TIER_INSTRUCTIONS: Record<string, string> = {
  lite: `You are a helpful coding assistant. Produce concise, working code with brief explanations.`,
  standard: `You are an expert software engineer. Produce complete, working code with sensible architecture and short rationale. Use idiomatic patterns. Include error handling for likely failure paths.`,
  pro: `You are a senior software engineer. Plan briefly, then deliver production-ready code:
- Strong typing where applicable
- Clean separation of concerns across multiple files when useful
- Proper error handling, input validation, edge cases
- Brief tests/usage examples when helpful
- Security and performance considerations called out`,
  expert: `You are a principal-level software engineer. Operate with maximum rigor:
- Begin with a short architectural plan (data model, modules, contracts)
- Deliver production-ready, multi-file code
- Comprehensive error handling, validation, observability hooks, security
- Provide unit tests and document non-obvious decisions
- Self-review for bugs before responding`,
};

const CODE_MODE_PREFIX = `You are operating in CODE MODE.

OUTPUT FORMAT — STRICT:
1. A short plan (1-5 bullets) describing what you'll build or change.
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
- Output the FULL file contents, not snippets or diffs.
- After all files, add a short "Next steps" section if relevant.

`;

// Mode-specific suffixes
const MODE_PLANNER_SUFFIX = `

ROLE: PLANNER (Nemotron 3 Super)
You are the planner half of a two-model team. Think hard about architecture, edge cases, and a robust file layout BEFORE the executor writes code. Keep your plan tight (≤8 bullets) but be opinionated about: data flow, module boundaries, error handling strategy, and what tests matter. Do NOT write the final code — output the plan only.`;

const MODE_EXECUTOR_SUFFIX = `

ROLE: EXECUTOR (GPT-OSS-120B)
You are the executor half of a two-model team. A planner has just produced an architectural plan (provided as context). Implement it FAITHFULLY, writing complete files using the strict code-block format. Improve on the plan only where you spot clear bugs.`;

const MODE_FIXER_SUFFIX = `

ROLE: AUTO-FIXER
You are reviewing existing workspace files for bugs, missing pieces, broken imports, type errors, unhandled edge cases, and security issues.
- If the code is already solid, respond with EXACTLY: "NO_ISSUES_FOUND" and nothing else.
- Otherwise, output a short list of issues (≤6 bullets) and then re-emit ONLY the files that need changes using the strict code-block format. Do not re-emit files that don't need fixes.`;

// Model fallback chains
const PLANNER_CHAIN = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openai/gpt-oss-120b:free",
  "google/gemma-4-31b-it:free",
];

const EXECUTOR_CHAIN = [
  "openai/gpt-oss-120b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
];

async function callModel(
  apiKey: string,
  chain: string[],
  messages: any[],
  opts: { temperature: number; max_tokens: number; stream?: boolean },
): Promise<Response | null> {
  let lastStatus = 500;
  let lastError = "";
  for (const candidate of chain) {
    console.log(`[code-chat] trying model: ${candidate} (stream=${!!opts.stream})`);
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://infinity-ai-and-search.lovable.app",
        "X-Title": "Infinity AI Code Mode",
      },
      body: JSON.stringify({
        model: candidate,
        messages,
        stream: opts.stream ?? false,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
      }),
    });
    if (r.ok) return r;
    lastStatus = r.status;
    lastError = await r.text();
    console.warn(`[code-chat] ${candidate} failed (${r.status}): ${lastError.slice(0, 200)}`);
    if (![404, 410, 429, 500, 502, 503].includes(r.status)) break;
  }
  console.error(`[code-chat] all models exhausted: ${lastStatus} ${lastError}`);
  return null;
}

async function readNonStream(resp: Response): Promise<string> {
  const j = await resp.json();
  return j.choices?.[0]?.message?.content ?? "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      messages,
      tier = "standard",
      existingFiles = [],
      mode = "build", // "build" | "fix"
    } = await req.json();

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
    const baseSystem = CODE_MODE_PREFIX + tierInstruction;

    // Build workspace context
    let workspaceCtx = "";
    if (existingFiles.length > 0) {
      const fileSummary = existingFiles
        .map((f: { path: string; language: string; content: string }) => {
          const preview = (f.content || "").slice(0, 1500);
          return `--- FILE: ${f.path} (${f.language}) ---\n${preview}${f.content && f.content.length > 1500 ? "\n... [truncated]" : ""}`;
        })
        .join("\n\n");
      workspaceCtx = `\n\nCURRENT WORKSPACE FILES:\n\n${fileSummary}`;
    }

    const temperature = tierKey === "expert" ? 0.2 : tierKey === "pro" ? 0.3 : 0.5;
    const maxTokens = tierKey === "expert" ? 4000 : tierKey === "pro" ? 3000 : 2000;

    // ============ FIX MODE: single-pass auto-fixer ============
    if (mode === "fix") {
      const fixSystem = baseSystem + workspaceCtx + MODE_FIXER_SUFFIX;
      const resp = await callModel(
        OPENROUTER_API_KEY,
        EXECUTOR_CHAIN,
        [{ role: "system", content: fixSystem }, ...messages],
        { temperature: 0.2, max_tokens: maxTokens, stream: true },
      );
      if (!resp) {
        return new Response(
          JSON.stringify({ error: "All models unavailable. Try again in a minute." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(resp.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // ============ BUILD MODE: planner + executor combo ============
    // Step 1: Planner produces architectural plan (non-streaming, fast)
    const plannerSystem = baseSystem + workspaceCtx + MODE_PLANNER_SUFFIX;
    const plannerResp = await callModel(
      OPENROUTER_API_KEY,
      PLANNER_CHAIN,
      [{ role: "system", content: plannerSystem }, ...messages],
      { temperature: 0.3, max_tokens: 800, stream: false },
    );

    let plan = "";
    if (plannerResp) {
      try {
        plan = await readNonStream(plannerResp);
      } catch (e) {
        console.warn("[code-chat] planner parse failed", e);
      }
    }
    console.log(`[code-chat] planner produced ${plan.length} chars`);

    // Step 2: Executor receives plan + workspace, streams the actual code
    const executorSystem =
      baseSystem +
      workspaceCtx +
      MODE_EXECUTOR_SUFFIX +
      (plan ? `\n\nPLANNER'S ARCHITECTURAL PLAN:\n${plan}\n` : "");

    const executorResp = await callModel(
      OPENROUTER_API_KEY,
      EXECUTOR_CHAIN,
      [{ role: "system", content: executorSystem }, ...messages],
      { temperature, max_tokens: maxTokens, stream: true },
    );

    if (!executorResp) {
      return new Response(
        JSON.stringify({
          error: "All free models are rate-limited. Please wait a minute and try again.",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(executorResp.body, {
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
