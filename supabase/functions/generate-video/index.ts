import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Try HuggingFace text-to-video and image-to-video models
async function tryHuggingFaceVideo(
  apiKey: string,
  prompt: string
): Promise<{ success: boolean; frames?: string[]; error?: string }> {
  // Updated 2025 models - try text-to-video first
  const t2vModels = [
    "Wan-AI/Wan2.1-T2V-1.3B",
    "ByteDance/AnimateDiff-Lightning",
    "hotshotco/Hotshot-XL",
  ];

  for (const model of t2vModels) {
    try {
      console.log(`[generate-video] Trying T2V model: ${model}`);
      
      const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: prompt,
          }),
        }
      );

      console.log(`[generate-video] ${model} status: ${response.status}`);

      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const bytes = new Uint8Array(await response.arrayBuffer());
        
        if (bytes.length > 1000) {
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, Array.from(chunk));
          }
          
          let mimeType = "video/mp4";
          if (contentType.includes("gif")) mimeType = "image/gif";
          else if (contentType.includes("webm")) mimeType = "video/webm";
          
          const dataUrl = `data:${mimeType};base64,${btoa(binary)}`;
          console.log(`[generate-video] ${model} success: ${bytes.length} bytes`);
          return { success: true, frames: [dataUrl] };
        }
      } else {
        const errorText = await response.text().catch(() => "");
        console.log(`[generate-video] ${model} failed: ${response.status} - ${errorText.substring(0, 150)}`);
        
        // Wait if model is loading
        if (response.status === 503 && errorText.includes("loading")) {
          console.log(`[generate-video] ${model} loading, waiting 20s...`);
          await new Promise(r => setTimeout(r, 20000));
        }
      }
    } catch (error) {
      console.error(`[generate-video] ${model} error:`, error);
    }
  }

  return { success: false, error: "HuggingFace video models unavailable" };
}

// Cloudflare SDXL frame generation fallback - reliable and always works
async function generateSDXLFrames(
  accountId: string,
  apiToken: string,
  prompt: string,
  frameCount: number
): Promise<string[]> {
  const frames: string[] = [];
  const batchSize = 8;
  const batches = Math.ceil(frameCount / batchSize);
  
  for (let batch = 0; batch < batches; batch++) {
    const startIdx = batch * batchSize;
    const endIdx = Math.min(startIdx + batchSize, frameCount);
    
    const batchPromises = [];
    for (let i = startIdx; i < endIdx; i++) {
      batchPromises.push(generateSingleFrame(accountId, apiToken, prompt, i, frameCount));
    }
    
    const batchResults = await Promise.all(batchPromises);
    frames.push(...batchResults.filter((f): f is string => f !== null));
    
    console.log(`[generate-video] SDXL batch ${batch + 1}/${batches} complete, ${frames.length} frames`);
  }
  
  return frames;
}

async function generateSingleFrame(
  accountId: string,
  apiToken: string,
  prompt: string,
  frameNumber: number,
  totalFrames: number
): Promise<string | null> {
  try {
    const progressPercent = ((frameNumber / (totalFrames - 1)) * 100).toFixed(1);
    const basePrompt = (prompt ?? "").toString().trim().slice(0, 500);
    
    // Motion phrase for temporal consistency
    const motionPhrase = frameNumber === 0
      ? "frozen starting position, 0% motion"
      : `${progressPercent}% through motion, tiny incremental change`;
    
    const enhancedPrompt = `${basePrompt}, ${motionPhrase}, frame ${frameNumber + 1} of ${totalFrames}, identical scene, consistent lighting, photorealistic, 8k`;

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
      const errText = await response.text().catch(() => "");
      console.error(`[generate-video] SDXL frame ${frameNumber + 1} error:`, response.status, errText.substring(0, 100));
      return null;
    }

    const imageBytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < imageBytes.length; i += chunkSize) {
      const chunk = imageBytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    return `data:image/png;base64,${btoa(binary)}`;
  } catch (error) {
    console.error(`[generate-video] Frame ${frameNumber + 1} failed:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, frameCount = 24 } = await req.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[generate-video] Generating video for:", prompt.substring(0, 100));

    const HUGGINGFACE_API_KEY = Deno.env.get("HUGGINGFACE_API_KEY");
    const CLOUDFLARE_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const CLOUDFLARE_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN");

    // Try HuggingFace video models first
    if (HUGGINGFACE_API_KEY) {
      console.log("[generate-video] Trying HuggingFace video models...");
      const hfResult = await tryHuggingFaceVideo(HUGGINGFACE_API_KEY, prompt);
      
      if (hfResult.success && hfResult.frames) {
        return new Response(
          JSON.stringify({
            frames: hfResult.frames,
            type: "video",
            model: "huggingface-video",
            fps: 8,
            quality: "high",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("[generate-video] HuggingFace failed, using Cloudflare SDXL fallback");
    }

    // Fallback to Cloudflare SDXL frame generation (reliable)
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
      throw new Error("No video generation backend configured");
    }

    const numFrames = Math.min(Math.max(frameCount, 8), 40);
    console.log(`[generate-video] Generating ${numFrames} SDXL frames...`);

    const frames = await generateSDXLFrames(
      CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN,
      prompt,
      numFrames
    );

    if (frames.length === 0) {
      throw new Error("Failed to generate any frames");
    }

    console.log(`[generate-video] Generated ${frames.length}/${numFrames} frames successfully`);

    return new Response(
      JSON.stringify({
        frames: frames,
        type: "frame-sequence",
        model: "cloudflare-sdxl",
        frameCount: frames.length,
        fps: 8,
        duration: frames.length / 8,
        quality: "high",
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
