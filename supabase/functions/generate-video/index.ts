import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateSDXLFrame(
  accountId: string, 
  apiToken: string, 
  prompt: string,
  frameNumber: number,
  totalFrames: number
): Promise<string | null> {
  try {
    // Add motion/progression hints to each frame
    const motionHints = [
      "initial position, beginning of motion",
      "slight movement, early progression", 
      "mid-motion, dynamic movement",
      "continued motion, building momentum",
      "peak action, climactic moment",
      "follow-through, completing motion"
    ];
    
    const hint = motionHints[Math.min(frameNumber, motionHints.length - 1)];
    const enhancedPrompt = `${prompt}, ${hint}, frame ${frameNumber + 1} of ${totalFrames}, cinematic quality, smooth motion, consistent lighting and style, 8k resolution, photorealistic`;

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
          num_steps: 30,
          guidance: 8.5,
          seed: 42 + frameNumber * 1000, // Consistent seed progression for smooth animation
        }),
      }
    );

    if (!response.ok) {
      console.error(`[generate-video] SDXL frame ${frameNumber + 1} error:`, response.status);
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
    const { prompt, frameCount = 6 } = await req.json();

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

    const numFrames = Math.min(Math.max(frameCount, 3), 8); // Between 3-8 frames
    console.log(`[generate-video] Generating ${numFrames} SDXL frames...`);

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
        fps: 4, // Suggested playback speed
        duration: frames.length / 4, // Duration in seconds
        model: "sdxl",
        quality: "high"
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
