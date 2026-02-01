import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function generateSDXLFrame(
  accountId: string, 
  apiToken: string, 
  prompt: string,
  frameNumber: number,
  totalFrames: number
): Promise<string | null> {
  try {
    // Calculate exact micro-progress for tiny frame-to-frame changes
    const progressPercent = ((frameNumber / (totalFrames - 1)) * 100).toFixed(1);
    
    // Ultra-consistent prompt - emphasize IDENTICAL scene with micro movement only
    const motionPhrase = frameNumber === 0 
      ? "frozen at exact starting position, 0% motion"
      : `exactly ${progressPercent}% through the motion, microscopic change from previous frame`;
    
    // Keep prompt length under control to avoid upstream request validation failures.
    const basePrompt = (prompt ?? "").toString().trim().slice(0, 700);

    // Build ultra-consistent prompt emphasizing frame-to-frame coherence
    const enhancedPrompt = `${basePrompt}, ${motionPhrase}, frame ${frameNumber + 1} of ${totalFrames}. CRITICAL: identical background, identical lighting, identical colors, identical composition, identical art style, identical camera angle; only a tiny subject movement from previous frame. photorealistic, 8k`;

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          // Known-good params for Cloudflare SDXL in this project (avoid 400s)
          num_steps: 20,
          guidance: 7.5,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(
        `[generate-video] SDXL frame ${frameNumber + 1} error:`,
        response.status,
        errText ? `| ${errText.substring(0, 500)}` : ""
      );
      return null;
    }

    // SDXL returns raw image bytes
    const imageBytes = new Uint8Array(await response.arrayBuffer());
    
    // Encode to base64 in chunks to avoid stack overflow
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < imageBytes.length; i += chunkSize) {
      const chunk = imageBytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    return `data:image/png;base64,${btoa(binary)}`;
  } catch (error) {
    console.error(`[generate-video] Frame ${frameNumber + 1} generation failed:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, frameCount = 40 } = await req.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[generate-video] Generating animated sequence for:", prompt.substring(0, 100));

    const CLOUDFLARE_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const CLOUDFLARE_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN");

    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
      throw new Error("Cloudflare credentials not configured");
    }

    const numFrames = Math.min(Math.max(frameCount, 8), 40); // Between 8-40 frames
    console.log(`[generate-video] Generating ${numFrames} frames for smooth video-like animation...`);

    // Generate frames in parallel for speed
    const framePromises = Array.from({ length: numFrames }, (_, i) =>
      generateSDXLFrame(CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, prompt, i, numFrames)
    );

    const frameResults = await Promise.all(framePromises);
    const frames = frameResults.filter((frame): frame is string => frame !== null);

    if (frames.length === 0) {
      throw new Error("Failed to generate any frames");
    }

    console.log(`[generate-video] Successfully generated ${frames.length}/${numFrames} frames`);

    return new Response(
      JSON.stringify({ 
        videoUrl: frames[0], // Primary frame for thumbnail
        frames: frames,
        type: "animated-sequence",
        frameCount: frames.length,
        fps: 8, // Higher FPS for smoother playback with more frames
        duration: frames.length / 8, // Duration in seconds
        model: "sdxl-1.0",
        quality: "ultra-smooth"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
