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
    // Calculate very subtle progression percentage for smooth animation
    const progressPercent = Math.round((frameNumber / (totalFrames - 1)) * 100);
    
    // Very subtle motion hints - tiny incremental changes
    const getSubtleMotionHint = (frame: number, total: number): string => {
      const progress = frame / (total - 1);
      if (progress === 0) return "static starting pose, frozen moment";
      if (progress < 0.1) return "imperceptible movement beginning, 5% motion";
      if (progress < 0.2) return "barely noticeable shift, 10% progression";
      if (progress < 0.3) return "subtle change, 20% into motion";
      if (progress < 0.4) return "gentle progression, 30% movement";
      if (progress < 0.5) return "smooth transition, 40% through motion";
      if (progress < 0.6) return "midpoint of action, 50% progression";
      if (progress < 0.7) return "continuing motion, 60% complete";
      if (progress < 0.75) return "approaching peak, 70% through";
      if (progress < 0.85) return "near completion, 80% motion";
      if (progress < 0.95) return "almost complete, 90% progression";
      return "final position, motion complete, 100%";
    };
    
    const hint = getSubtleMotionHint(frameNumber, totalFrames);
    const enhancedPrompt = `${prompt}, ${hint}, frame ${frameNumber + 1} of ${totalFrames}, ultra smooth animation, consistent character and scene, identical lighting, same camera angle, photorealistic, 8k quality, seamless motion`;

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
          num_steps: 20,
          guidance: 7.5,
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
    const { prompt, frameCount = 16 } = await req.json();

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

    const numFrames = Math.min(Math.max(frameCount, 4), 16); // Between 4-16 frames
    console.log(`[generate-video] Generating ${numFrames} high-quality SDXL frames for smooth animation...`);

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
