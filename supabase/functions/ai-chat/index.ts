export default {
  async fetch(request: Request, env: any) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "content-type",
        },
      });
    }

    try {
      const { messages, model } = await request.json();

      if (!messages || !Array.isArray(messages)) {
        return new Response("Invalid messages", { status: 400 });
      }

      const isGPTOSS = model?.includes("gpt-oss");

      // ================================
      // GPT-OSS-120B (NO STREAMING)
      // ================================
      if (isGPTOSS) {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/@cf/openai/gpt-oss-120b`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.CF_API_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              input: messages.map((m: any) => `${m.role}: ${m.content}`).join("\n"),
            }),
          }
        );

        const data = await response.json();

        return new Response(
          JSON.stringify({
            content:
              data?.result?.response ||
              data?.result?.output_text ||
              "",
          }),
          {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "application/json",
            },
          }
        );
      }

      // ================================
      // OTHER MODELS (STREAMING)
      // ================================
      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
          }),
        }
      );

      return new Response(response.body, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "text/event-stream",
        },
      });
    } catch (err: any) {
      return new Response(err.message || "Error", { status: 500 });
    }
  },
};
