import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HF_ROUTER_BASE = "https://router.huggingface.co/hf-inference/models";
const hfModelUrl = (model: string) => `${HF_ROUTER_BASE}/${model}`;

// Convert binary buffer to base64 data URL
function bufferToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

// Detect content type from response or bytes
function detectContentType(contentType: string, bytes: Uint8Array): string {
  if (contentType.includes("mp4")) return "video/mp4";
  if (contentType.includes("webm")) return "video/webm";
  if (contentType.includes("gif")) return "image/gif";
  if (contentType.includes("png")) return "image/png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "image/jpeg";
  
  // Check magic bytes
  if (bytes.length >= 4) {
    // MP4: starts with ftyp
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      return "video/mp4";
    }
    // WebM: starts with 0x1A 0x45 0xDF 0xA3
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
      return "video/webm";
    }
    // GIF: starts with GIF
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return "image/gif";
    }
    // PNG: starts with 0x89 PNG
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return "image/png";
    }
  }
  
  return "video/mp4"; // Default
}

// Try Mochi 1 Preview - text-to-video model
async function tryMochi(apiKey: string, prompt: string): Promise<{ success: boolean; dataUrl?: string; error?: string }> {
  const mochiModels = [
    "genmo/mochi-1-preview",
    "Genmo/Mochi-1-preview"
  ];
  
  for (const model of mochiModels) {
    try {
      console.log(`[generate-video] Trying Mochi model: ${model}`);
      
      const response = await fetch(
        hfModelUrl(model),
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
      
      console.log(`[generate-video] Mochi ${model} status: ${response.status}`);
      
      if (response.status === 503) {
        const errorText = await response.text().catch(() => "");
        console.log(`[generate-video] Mochi loading: ${errorText.substring(0, 100)}`);
        if (errorText.includes("loading")) {
          console.log("[generate-video] Waiting 30s for Mochi to load...");
          await new Promise(r => setTimeout(r, 30000));
          continue;
        }
      }
      
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          const errorText = await response.text().catch(() => "");
          console.log(`[generate-video] Mochi ${model} returned JSON: ${errorText.substring(0, 150)}`);
          continue;
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        
        if (bytes.length > 1000) {
          const mimeType = detectContentType(contentType, bytes);
          const dataUrl = bufferToDataUrl(bytes, mimeType);
          console.log(`[generate-video] Mochi success: ${bytes.length} bytes, type: ${mimeType}`);
          return { success: true, dataUrl };
        }
      }
      
      const errorText = await response.text().catch(() => "");
      console.log(`[generate-video] Mochi ${model} error: ${errorText.substring(0, 150)}`);
    } catch (error) {
      console.error(`[generate-video] Mochi ${model} exception:`, error);
    }
  }
  
  return { success: false, error: "Mochi models unavailable" };
}

// Try Stable Video Diffusion (image-to-video) - generate image first then animate
async function trySVD(apiKey: string, prompt: string, cfAccountId?: string, cfToken?: string): Promise<{ success: boolean; dataUrl?: string; error?: string }> {
  console.log("[generate-video] Trying SVD pipeline...");
  
  // First generate a base image
  let baseImageBytes: Uint8Array | null = null;
  
  // Try Cloudflare SDXL for base image
  if (cfAccountId && cfToken) {
    try {
      console.log("[generate-video] Generating base image with Cloudflare SDXL...");
      const imgResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: prompt,
            num_steps: 20,
            guidance: 7.5,
          }),
        }
      );
      
      if (imgResponse.ok) {
        baseImageBytes = new Uint8Array(await imgResponse.arrayBuffer());
        console.log(`[generate-video] Base image generated: ${baseImageBytes.length} bytes`);
      }
    } catch (error) {
      console.error("[generate-video] Cloudflare SDXL error:", error);
    }
  }
  
  // Fallback: try HuggingFace SDXL for base image
  if (!baseImageBytes) {
    try {
      console.log("[generate-video] Trying HuggingFace SDXL for base image...");
      const imgResponse = await fetch(
        hfModelUrl("stabilityai/stable-diffusion-xl-base-1.0"),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: prompt }),
        }
      );
      
      if (imgResponse.ok) {
        baseImageBytes = new Uint8Array(await imgResponse.arrayBuffer());
        console.log(`[generate-video] HF SDXL base image: ${baseImageBytes.length} bytes`);
      }
    } catch (error) {
      console.error("[generate-video] HuggingFace SDXL error:", error);
    }
  }
  
  if (!baseImageBytes || baseImageBytes.length < 1000) {
    return { success: false, error: "Could not generate base image for SVD" };
  }
  
  // Now try SVD models to animate the image
  const svdModels = [
    "stabilityai/stable-video-diffusion-img2vid-xt",
    "stabilityai/stable-video-diffusion-img2vid",
    "stabilityai/stable-video-diffusion-img2vid-xt-1-1"
  ];
  
  for (const model of svdModels) {
    try {
      console.log(`[generate-video] Trying SVD model: ${model}`);
      
      // Convert image bytes to base64 for SVD input
      const imageDataUrl = bufferToDataUrl(baseImageBytes, "image/png");
      const imagePureBase64 = imageDataUrl.split(",")[1] || imageDataUrl;
      
      const tryOnce = async (inputs: string) =>
        await fetch(hfModelUrl(model), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs }),
        });

      // Some pipelines accept full data URLs, others want the raw base64 string.
      let response = await tryOnce(imageDataUrl);
      if (!response.ok) response = await tryOnce(imagePureBase64);
      
      console.log(`[generate-video] SVD ${model} status: ${response.status}`);
      
      if (response.status === 503) {
        const errorText = await response.text().catch(() => "");
        console.log(`[generate-video] SVD loading: ${errorText.substring(0, 100)}`);
        if (errorText.includes("loading")) {
          console.log("[generate-video] Waiting 30s for SVD to load...");
          await new Promise(r => setTimeout(r, 30000));
          continue;
        }
      }
      
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          const errorText = await response.text().catch(() => "");
          console.log(`[generate-video] SVD ${model} returned JSON: ${errorText.substring(0, 150)}`);
          continue;
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        
        if (bytes.length > 1000) {
          const mimeType = detectContentType(contentType, bytes);
          const dataUrl = bufferToDataUrl(bytes, mimeType);
          console.log(`[generate-video] SVD success: ${bytes.length} bytes, type: ${mimeType}`);
          return { success: true, dataUrl };
        }
      }
      
      const errorText = await response.text().catch(() => "");
      console.log(`[generate-video] SVD ${model} error: ${errorText.substring(0, 150)}`);
    } catch (error) {
      console.error(`[generate-video] SVD ${model} exception:`, error);
    }
  }
  
  // If SVD fails, do NOT return a 1-frame fallback (users expect a real video)
  console.log("[generate-video] SVD failed; skipping 1-frame fallback");
  return { success: false, error: "SVD failed to generate a video" };
}

// Try other text-to-video models as additional fallback
async function tryOtherT2V(apiKey: string, prompt: string): Promise<{ success: boolean; dataUrl?: string; error?: string }> {
  const t2vModels = [
    "Wan-AI/Wan2.1-T2V-1.3B",
    "ByteDance/AnimateDiff-Lightning",
    "hotshotco/Hotshot-XL",
    "ali-vilab/text-to-video-ms-1.7b"
  ];
  
  for (const model of t2vModels) {
    try {
      console.log(`[generate-video] Trying T2V model: ${model}`);
      
      const response = await fetch(
        hfModelUrl(model),
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
      
      if (response.status === 503) {
        const errorText = await response.text().catch(() => "");
        if (errorText.includes("loading")) {
          console.log(`[generate-video] ${model} loading, skipping...`);
          continue;
        }
      }
      
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          const errorText = await response.text().catch(() => "");
          console.log(`[generate-video] ${model} returned JSON: ${errorText.substring(0, 150)}`);
          continue;
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        
        if (bytes.length > 1000) {
          const mimeType = detectContentType(contentType, bytes);
          const dataUrl = bufferToDataUrl(bytes, mimeType);
          console.log(`[generate-video] ${model} success: ${bytes.length} bytes, type: ${mimeType}`);
          return { success: true, dataUrl };
        }
      }
    } catch (error) {
      console.error(`[generate-video] ${model} exception:`, error);
    }
  }
  
  return { success: false, error: "No T2V models available" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt } = await req.json();

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

    if (!HUGGINGFACE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Video generation not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Try Mochi 1 Preview first (best text-to-video)
    console.log("[generate-video] Step 1: Trying Mochi 1 Preview...");
    const mochiResult = await tryMochi(HUGGINGFACE_API_KEY, prompt);
    if (mochiResult.success && mochiResult.dataUrl) {
      return new Response(
        JSON.stringify({
          frames: [mochiResult.dataUrl],
          type: "video",
          model: "mochi-1-preview",
          fps: 24,
          quality: "high",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("[generate-video] Mochi failed:", mochiResult.error);

    // 2. Try SVD pipeline (image-to-video)
    console.log("[generate-video] Step 2: Trying SVD pipeline...");
    const svdResult = await trySVD(HUGGINGFACE_API_KEY, prompt, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN);
    if (svdResult.success && svdResult.dataUrl) {
      const isVideo = svdResult.dataUrl.includes("video/");
      return new Response(
        JSON.stringify({
          frames: [svdResult.dataUrl],
          type: isVideo ? "video" : "image",
          model: isVideo ? "stable-video-diffusion" : "sdxl-fallback",
          fps: isVideo ? 14 : 1,
          quality: "high",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("[generate-video] SVD failed:", svdResult.error);

    // 3. Try other T2V models
    console.log("[generate-video] Step 3: Trying other T2V models...");
    const t2vResult = await tryOtherT2V(HUGGINGFACE_API_KEY, prompt);
    if (t2vResult.success && t2vResult.dataUrl) {
      return new Response(
        JSON.stringify({
          frames: [t2vResult.dataUrl],
          type: "video",
          model: "huggingface-t2v",
          fps: 8,
          quality: "medium",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("[generate-video] T2V failed:", t2vResult.error);

    // All methods failed
    throw new Error("All video generation methods failed. Please try again later.");
  } catch (error) {
    console.error("[generate-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
