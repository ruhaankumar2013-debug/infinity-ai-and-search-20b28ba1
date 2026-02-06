import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// HuggingFace models
const HF_ROUTER_API = "https://router.huggingface.co/hf-inference/models";
const VIDEO_MODELS = [
  "Wan-AI/Wan2.1-T2V-1.3B",
  "ali-vilab/text-to-video-ms-1.7b",
];

// Cloudflare API
const CF_API_BASE = "https://api.cloudflare.com/client/v4/accounts";

// Convert binary buffer to base64 data URL (chunked to avoid stack overflow)
function bufferToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

// Detect content type
function detectContentType(contentType: string, bytes: Uint8Array): string {
  if (contentType.includes("mp4")) return "video/mp4";
  if (contentType.includes("webm")) return "video/webm";
  if (contentType.includes("gif")) return "image/gif";
  if (contentType.includes("png")) return "image/png";
  
  if (bytes.length >= 8) {
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "video/mp4";
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) return "video/webm";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return "image/png";
  }
  
  return "video/mp4";
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Try HuggingFace video models
async function tryHuggingFaceVideo(
  apiKey: string,
  prompt: string
): Promise<{ success: boolean; dataUrl?: string; estimatedTime?: number }> {
  
  for (const modelId of VIDEO_MODELS) {
    console.log(`[generate-video] Trying HF model: ${modelId}`);
    
    try {
      const response = await fetch(`${HF_ROUTER_API}/${modelId}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: prompt }),
      });
      
      console.log(`[generate-video] HF status: ${response.status} for ${modelId}`);
      
      if (response.status === 404 || response.status === 422) {
        continue; // Try next model
      }
      
      if (response.status === 503) {
        const errorData = await response.json().catch(() => ({}));
        const estimatedTime = errorData.estimated_time || 30;
        console.log(`[generate-video] HF model loading, estimated: ${estimatedTime}s`);
        return { success: false, estimatedTime };
      }
      
      if (!response.ok) {
        continue;
      }
      
      const contentType = response.headers.get("content-type") || "";
      
      if (contentType.includes("application/json")) {
        const jsonData = await response.json();
        if (jsonData.video || jsonData.output) {
          const videoData = jsonData.video || jsonData.output;
          if (typeof videoData === 'string') {
            return { 
              success: true, 
              dataUrl: videoData.startsWith('data:') ? videoData : `data:video/mp4;base64,${videoData}` 
            };
          }
        }
        continue;
      }
      
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 500) continue;
      
      const mimeType = detectContentType(contentType, bytes);
      const dataUrl = bufferToDataUrl(bytes, mimeType);
      console.log(`[generate-video] HF success! ${bytes.length} bytes`);
      return { success: true, dataUrl };
      
    } catch (error) {
      console.error(`[generate-video] HF exception:`, error);
    }
  }
  
  return { success: false };
}

// Generate coherent animation frames using Cloudflare SDXL
async function generateSDXLFrames(
  cfAccountId: string,
  cfApiToken: string,
  prompt: string,
  frameCount: number = 8
): Promise<{ success: boolean; frames?: string[]; error?: string }> {
  
  console.log(`[generate-video] Generating ${frameCount} SDXL frames for animation...`);
  
  const frames: string[] = [];
  const sdxlUrl = `${CF_API_BASE}/${cfAccountId}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`;
  
  // Add motion cues to prompt for animation variety
  const motionPrompts = [
    prompt,
    `${prompt}, slight movement, frame 2`,
    `${prompt}, motion blur, frame 3`,
    `${prompt}, dynamic pose, frame 4`,
    `${prompt}, action shot, frame 5`,
    `${prompt}, movement, frame 6`,
    `${prompt}, flowing motion, frame 7`,
    `${prompt}, cinematic, frame 8`,
  ];
  
  for (let i = 0; i < Math.min(frameCount, motionPrompts.length); i++) {
    const framePrompt = motionPrompts[i];
    console.log(`[generate-video] Generating frame ${i + 1}/${frameCount}`);
    
    try {
      const response = await fetch(sdxlUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cfApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: framePrompt,
          num_steps: 20,
          guidance: 7.5,
          seed: 12345 + i, // Consistent seed with slight variation
        }),
      });
      
      if (!response.ok) {
        console.error(`[generate-video] SDXL frame ${i + 1} failed: ${response.status}`);
        continue;
      }
      
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 1000) {
        const dataUrl = bufferToDataUrl(bytes, "image/png");
        frames.push(dataUrl);
        console.log(`[generate-video] Frame ${i + 1} generated: ${bytes.length} bytes`);
      }
      
      // Small delay between frames
      if (i < frameCount - 1) {
        await sleep(200);
      }
      
    } catch (error) {
      console.error(`[generate-video] SDXL frame ${i + 1} exception:`, error);
    }
  }
  
  if (frames.length >= 4) {
    console.log(`[generate-video] SDXL animation complete: ${frames.length} frames`);
    return { success: true, frames };
  }
  
  return { success: false, error: "Failed to generate enough frames" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, frameCount = 8 } = await req.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[generate-video] Generating for:", prompt.substring(0, 100));

    const HF_TOKEN = Deno.env.get("HUGGINGFACE_API_KEY");
    const CF_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const CF_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN");

    // Try HuggingFace video models first (if API key available)
    if (HF_TOKEN) {
      console.log("[generate-video] Attempting HuggingFace video models...");
      const hfResult = await tryHuggingFaceVideo(HF_TOKEN, prompt);
      
      if (hfResult.success && hfResult.dataUrl) {
        const isVideo = hfResult.dataUrl.includes("video/");
        return new Response(
          JSON.stringify({
            frames: [hfResult.dataUrl],
            type: isVideo ? "video" : "gif",
            model: "huggingface-video",
            fps: 8,
            quality: "high",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // If HF is loading, return with countdown
      if (hfResult.estimatedTime) {
        console.log("[generate-video] HF model loading, falling back to SDXL...");
      }
    }

    // Fallback to SDXL frame animation
    if (CF_ACCOUNT_ID && CF_API_TOKEN) {
      console.log("[generate-video] Using SDXL frame animation fallback...");
      const sdxlResult = await generateSDXLFrames(CF_ACCOUNT_ID, CF_API_TOKEN, prompt, frameCount);
      
      if (sdxlResult.success && sdxlResult.frames && sdxlResult.frames.length > 0) {
        return new Response(
          JSON.stringify({
            frames: sdxlResult.frames,
            type: "animation",
            model: "sdxl-animation",
            fps: 8,
            quality: "high",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // No fallback available
    const missingKeys = [];
    if (!HF_TOKEN) missingKeys.push("HUGGINGFACE_API_KEY");
    if (!CF_ACCOUNT_ID || !CF_API_TOKEN) missingKeys.push("CLOUDFLARE credentials");
    
    return new Response(
      JSON.stringify({
        error: missingKeys.length > 0 
          ? `Video generation requires: ${missingKeys.join(" or ")}`
          : "All video generation methods failed. Please try again later.",
        retryable: true,
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[generate-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
