import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Try Hugging Face text-to-video models
async function tryHuggingFaceVideo(
  apiKey: string,
  prompt: string
): Promise<{ success: boolean; videoUrl?: string; frames?: string[]; error?: string }> {
  // Models to try in order (free tier compatible, smaller models)
  const models = [
    "ali-vilab/text-to-video-ms-1.7b", // Microsoft's text-to-video
    "damo-vilab/text-to-video-ms-1.7b", // DAMO text-to-video  
    "cerspense/zeroscope_v2_576w", // ZeroScope (lighter)
  ];

  for (const model of models) {
    try {
      console.log(`[generate-video] Trying HuggingFace model: ${model}`);
      
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
            parameters: {
              num_frames: 24,
              num_inference_steps: 25,
            },
          }),
        }
      );

      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        
        if (contentType.includes("video") || contentType.includes("mp4")) {
          // Got actual video - encode to base64 data URL
          const videoBytes = new Uint8Array(await response.arrayBuffer());
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < videoBytes.length; i += chunkSize) {
            const chunk = videoBytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, Array.from(chunk));
          }
          const videoUrl = `data:video/mp4;base64,${btoa(binary)}`;
          console.log(`[generate-video] HuggingFace ${model} returned video!`);
          return { success: true, videoUrl };
        } else if (contentType.includes("image")) {
          // Some models return GIF or image sequence
          const imageBytes = new Uint8Array(await response.arrayBuffer());
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < imageBytes.length; i += chunkSize) {
            const chunk = imageBytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, Array.from(chunk));
          }
          const imageUrl = `data:image/gif;base64,${btoa(binary)}`;
          console.log(`[generate-video] HuggingFace ${model} returned image/gif`);
          return { success: true, frames: [imageUrl] };
        } else {
          // Try to parse as JSON (might contain URL)
          try {
            const json = await response.json();
            if (json.video_url || json.url) {
              return { success: true, videoUrl: json.video_url || json.url };
            }
          } catch {
            // Not JSON
          }
        }
      } else {
        const errorText = await response.text().catch(() => "");
        console.log(`[generate-video] HuggingFace ${model} failed: ${response.status} ${errorText.substring(0, 200)}`);
        
        // If model is loading, wait and retry once
        if (response.status === 503 && errorText.includes("loading")) {
          console.log(`[generate-video] Model ${model} is loading, waiting 20s...`);
          await new Promise(r => setTimeout(r, 20000));
          continue; // Retry this model
        }
      }
    } catch (error) {
      console.error(`[generate-video] HuggingFace ${model} error:`, error);
    }
  }

  return { success: false, error: "No HuggingFace video models available" };
}

// Fallback: Generate SDXL frames with maximum consistency
async function generateSDXLFrames(
  accountId: string,
  apiToken: string,
  prompt: string,
  frameCount: number
): Promise<string[]> {
  const frames: string[] = [];
  
  // Generate frames in batches to avoid overwhelming the API
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
    
    console.log(`[generate-video] Batch ${batch + 1}/${batches} complete, ${frames.length} frames total`);
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
    
    // Motion phrase for this frame
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
      console.error(`[generate-video] SDXL frame ${frameNumber + 1} error:`, response.status, errText.substring(0, 200));
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
    console.error(`[generate-video] Frame ${frameNumber + 1} generation failed:`, error);
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
      console.log("[generate-video] Attempting HuggingFace video generation...");
      const hfResult = await tryHuggingFaceVideo(HUGGINGFACE_API_KEY, prompt);
      
      if (hfResult.success) {
        return new Response(
          JSON.stringify({
            videoUrl: hfResult.videoUrl || hfResult.frames?.[0],
            frames: hfResult.frames,
            type: hfResult.videoUrl ? "video" : "animated-sequence",
            model: "huggingface-video",
            quality: "high",
            fps: 8,
            duration: 3,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("[generate-video] HuggingFace video failed, falling back to SDXL frames");
    }

    // Fallback to SDXL frame generation
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
      throw new Error("Neither HuggingFace video nor Cloudflare SDXL is configured");
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

    console.log(`[generate-video] Successfully generated ${frames.length}/${numFrames} frames`);

    return new Response(
      JSON.stringify({
        videoUrl: frames[0],
        frames: frames,
        type: "animated-sequence",
        frameCount: frames.length,
        fps: 8,
        duration: frames.length / 8,
        model: "sdxl-1.0",
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
