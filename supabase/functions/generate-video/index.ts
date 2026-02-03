import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Convert binary to base64 safely
function binaryToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// Generate base image with SDXL for img2vid pipeline
async function generateBaseImage(
  accountId: string,
  apiToken: string,
  prompt: string
): Promise<string | null> {
  try {
    console.log("[generate-video] Generating base image with SDXL...");
    
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: `${prompt}, high quality, detailed, 8k`,
          num_steps: 25,
          guidance: 7.5,
        }),
      }
    );

    if (!response.ok) {
      console.error("[generate-video] SDXL base image failed:", response.status);
      return null;
    }

    const imageBytes = new Uint8Array(await response.arrayBuffer());
    const base64 = binaryToBase64(imageBytes);
    console.log("[generate-video] Base image generated successfully");
    return base64;
  } catch (error) {
    console.error("[generate-video] Base image error:", error);
    return null;
  }
}

// Try Mochi 1 Preview text-to-video
async function tryMochi1(
  apiKey: string,
  prompt: string
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  console.log("[generate-video] Trying Mochi 1 Preview...");
  
  try {
    const response = await fetch(
      "https://router.huggingface.co/hf-inference/models/genmo/mochi-1-preview",
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

    console.log(`[generate-video] Mochi 1 status: ${response.status}`);

    if (response.status === 503) {
      const errorText = await response.text();
      if (errorText.includes("loading")) {
        console.log("[generate-video] Mochi 1 loading, waiting 30s...");
        await new Promise(r => setTimeout(r, 30000));
        return tryMochi1(apiKey, prompt); // Retry once
      }
    }

    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      const bytes = new Uint8Array(await response.arrayBuffer());
      
      if (bytes.length > 1000) {
        let mimeType = "video/mp4";
        if (contentType.includes("gif")) mimeType = "image/gif";
        else if (contentType.includes("webm")) mimeType = "video/webm";
        
        const dataUrl = `data:${mimeType};base64,${binaryToBase64(bytes)}`;
        console.log(`[generate-video] Mochi 1 success: ${bytes.length} bytes`);
        return { success: true, videoUrl: dataUrl };
      }
    }

    const errorText = await response.text().catch(() => "");
    console.log(`[generate-video] Mochi 1 failed: ${errorText.substring(0, 200)}`);
    return { success: false, error: errorText };
  } catch (error) {
    console.error("[generate-video] Mochi 1 error:", error);
    return { success: false, error: String(error) };
  }
}

// Try Stable Video Diffusion image-to-video
async function trySVD(
  apiKey: string,
  imageBase64: string
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  console.log("[generate-video] Trying Stable Video Diffusion img2vid...");
  
  const svdModels = [
    "stabilityai/stable-video-diffusion-img2vid-xt",
    "stabilityai/stable-video-diffusion-img2vid",
  ];

  for (const model of svdModels) {
    try {
      console.log(`[generate-video] Trying SVD model: ${model}`);
      
      // Convert base64 to binary for HF API
      const binaryData = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
      
      const response = await fetch(
        `https://router.huggingface.co/hf-inference/models/${model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "image/png",
          },
          body: binaryData,
        }
      );

      console.log(`[generate-video] ${model} status: ${response.status}`);

      if (response.status === 503) {
        const errorText = await response.text();
        if (errorText.includes("loading")) {
          console.log(`[generate-video] ${model} loading, waiting 30s...`);
          await new Promise(r => setTimeout(r, 30000));
          continue; // Try next model or retry
        }
      }

      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const bytes = new Uint8Array(await response.arrayBuffer());
        
        if (bytes.length > 1000) {
          let mimeType = "video/mp4";
          if (contentType.includes("gif")) mimeType = "image/gif";
          else if (contentType.includes("webm")) mimeType = "video/webm";
          
          const dataUrl = `data:${mimeType};base64,${binaryToBase64(bytes)}`;
          console.log(`[generate-video] ${model} success: ${bytes.length} bytes`);
          return { success: true, videoUrl: dataUrl };
        }
      }

      const errorText = await response.text().catch(() => "");
      console.log(`[generate-video] ${model} failed: ${errorText.substring(0, 200)}`);
    } catch (error) {
      console.error(`[generate-video] ${model} error:`, error);
    }
  }

  return { success: false, error: "SVD models unavailable" };
}

// Try text-to-video models directly
async function tryTextToVideo(
  apiKey: string,
  prompt: string
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  const t2vModels = [
    "ali-vilab/text-to-video-ms-1.7b",
    "damo-vilab/text-to-video-ms-1.7b",
    "cerspense/zeroscope_v2_576w",
  ];

  for (const model of t2vModels) {
    try {
      console.log(`[generate-video] Trying T2V model: ${model}`);
      
      const response = await fetch(
        `https://router.huggingface.co/hf-inference/models/${model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: prompt }),
        }
      );

      console.log(`[generate-video] ${model} status: ${response.status}`);

      if (response.status === 503) {
        const errorText = await response.text();
        if (errorText.includes("loading")) {
          console.log(`[generate-video] ${model} loading, waiting 20s...`);
          await new Promise(r => setTimeout(r, 20000));
        }
        continue;
      }

      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const bytes = new Uint8Array(await response.arrayBuffer());
        
        if (bytes.length > 1000) {
          let mimeType = "video/mp4";
          if (contentType.includes("gif")) mimeType = "image/gif";
          else if (contentType.includes("webm")) mimeType = "video/webm";
          
          const dataUrl = `data:${mimeType};base64,${binaryToBase64(bytes)}`;
          console.log(`[generate-video] ${model} success: ${bytes.length} bytes`);
          return { success: true, videoUrl: dataUrl };
        }
      }

      const errorText = await response.text().catch(() => "");
      console.log(`[generate-video] ${model} failed: ${errorText.substring(0, 200)}`);
    } catch (error) {
      console.error(`[generate-video] ${model} error:`, error);
    }
  }

  return { success: false, error: "T2V models unavailable" };
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
      throw new Error("HUGGINGFACE_API_KEY is required for video generation");
    }

    // Strategy 1: Try Mochi 1 Preview (text-to-video)
    console.log("[generate-video] Strategy 1: Mochi 1 Preview");
    const mochiResult = await tryMochi1(HUGGINGFACE_API_KEY, prompt);
    if (mochiResult.success && mochiResult.videoUrl) {
      return new Response(
        JSON.stringify({
          frames: [mochiResult.videoUrl],
          type: "video",
          model: "mochi-1-preview",
          fps: 24,
          quality: "high",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Strategy 2: Try other text-to-video models
    console.log("[generate-video] Strategy 2: Text-to-Video models");
    const t2vResult = await tryTextToVideo(HUGGINGFACE_API_KEY, prompt);
    if (t2vResult.success && t2vResult.videoUrl) {
      return new Response(
        JSON.stringify({
          frames: [t2vResult.videoUrl],
          type: "video",
          model: "huggingface-t2v",
          fps: 8,
          quality: "high",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Strategy 3: Generate base image with SDXL, then animate with SVD
    if (CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) {
      console.log("[generate-video] Strategy 3: SDXL base image + SVD animation");
      
      const baseImage = await generateBaseImage(CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, prompt);
      
      if (baseImage) {
        // Return base image to user first
        const baseImageUrl = `data:image/png;base64,${baseImage}`;
        
        // Try to animate with SVD
        const svdResult = await trySVD(HUGGINGFACE_API_KEY, baseImage);
        
        if (svdResult.success && svdResult.videoUrl) {
          return new Response(
            JSON.stringify({
              frames: [svdResult.videoUrl],
              baseImage: baseImageUrl,
              type: "video",
              model: "stable-video-diffusion",
              fps: 14,
              quality: "high",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // If SVD failed, return the base image as a single frame
        console.log("[generate-video] SVD failed, returning base image");
        return new Response(
          JSON.stringify({
            frames: [baseImageUrl],
            type: "image",
            model: "sdxl-base",
            message: "Video models are currently busy. Here's the base image that would be animated.",
            quality: "high",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    throw new Error("All video generation methods failed. HuggingFace models may be loading or unavailable.");
  } catch (error) {
    console.error("[generate-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
