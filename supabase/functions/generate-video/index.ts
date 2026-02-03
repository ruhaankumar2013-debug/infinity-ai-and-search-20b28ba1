import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Step 1: Generate base image from text using SDXL on HuggingFace
async function generateBaseImage(apiKey: string, prompt: string): Promise<Blob | null> {
  const imageModels = [
    "stabilityai/stable-diffusion-xl-base-1.0",
    "runwayml/stable-diffusion-v1-5",
    "CompVis/stable-diffusion-v1-4",
  ];

  for (const model of imageModels) {
    try {
      console.log(`[generate-video] Generating base image with: ${model}`);
      
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
              num_inference_steps: 30,
              guidance_scale: 7.5,
            },
          }),
        }
      );

      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("image")) {
          console.log(`[generate-video] Base image generated with ${model}`);
          return await response.blob();
        }
      } else {
        const errorText = await response.text().catch(() => "");
        console.log(`[generate-video] ${model} failed: ${response.status}`);
        
        if (response.status === 503 && errorText.includes("loading")) {
          console.log(`[generate-video] Model ${model} loading, waiting 15s...`);
          await new Promise(r => setTimeout(r, 15000));
          continue;
        }
      }
    } catch (error) {
      console.error(`[generate-video] ${model} error:`, error);
    }
  }
  
  return null;
}

// Step 2: Use SVD to animate the base image into video frames
async function animateWithSVD(
  apiKey: string,
  imageBlob: Blob
): Promise<{ success: boolean; frames?: string[]; error?: string }> {
  const svdModels = [
    "stabilityai/stable-video-diffusion-img2vid-xt",
    "stabilityai/stable-video-diffusion-img2vid",
  ];

  for (const model of svdModels) {
    try {
      console.log(`[generate-video] Animating with SVD model: ${model}`);
      
      // SVD expects image input as binary
      const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "image/png",
          },
          body: imageBlob,
        }
      );

      const contentType = response.headers.get("content-type") || "";
      console.log(`[generate-video] SVD ${model} status: ${response.status}, type: ${contentType}`);

      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        
        if (bytes.length > 1000) {
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, Array.from(chunk));
          }
          
          // SVD typically returns MP4 or GIF
          let mimeType = "video/mp4";
          if (contentType.includes("gif")) {
            mimeType = "image/gif";
          } else if (contentType.includes("webm")) {
            mimeType = "video/webm";
          }
          
          const dataUrl = `data:${mimeType};base64,${btoa(binary)}`;
          console.log(`[generate-video] SVD ${model} returned ${bytes.length} bytes as ${mimeType}`);
          return { success: true, frames: [dataUrl] };
        }
      } else {
        const errorText = await response.text().catch(() => "");
        console.log(`[generate-video] SVD ${model} failed: ${response.status} ${errorText.substring(0, 200)}`);
        
        if (response.status === 503 && errorText.includes("loading")) {
          console.log(`[generate-video] SVD ${model} loading, waiting 20s...`);
          await new Promise(r => setTimeout(r, 20000));
          continue;
        }
      }
    } catch (error) {
      console.error(`[generate-video] SVD ${model} error:`, error);
    }
  }

  return { success: false, error: "SVD models unavailable" };
}

// Alternative: Text-to-video models (no base image needed)
async function tryTextToVideo(
  apiKey: string,
  prompt: string
): Promise<{ success: boolean; frames?: string[]; error?: string }> {
  const t2vModels = [
    "ali-vilab/text-to-video-ms-1.7b",
    "damo-vilab/text-to-video-ms-1.7b",
    "cerspense/zeroscope_v2_576w",
  ];

  for (const model of t2vModels) {
    try {
      console.log(`[generate-video] Trying text-to-video: ${model}`);
      
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
          
          const dataUrl = `data:${mimeType};base64,${btoa(binary)}`;
          console.log(`[generate-video] T2V ${model} success: ${bytes.length} bytes`);
          return { success: true, frames: [dataUrl] };
        }
      } else {
        const errorText = await response.text().catch(() => "");
        console.log(`[generate-video] T2V ${model} failed: ${response.status}`);
        
        if (response.status === 503 && errorText.includes("loading")) {
          await new Promise(r => setTimeout(r, 20000));
          continue;
        }
      }
    } catch (error) {
      console.error(`[generate-video] T2V ${model} error:`, error);
    }
  }

  return { success: false, error: "Text-to-video models unavailable" };
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

    console.log("[generate-video] Starting SVD video generation for:", prompt.substring(0, 100));

    const HUGGINGFACE_API_KEY = Deno.env.get("HUGGINGFACE_API_KEY");

    if (!HUGGINGFACE_API_KEY) {
      throw new Error("HUGGINGFACE_API_KEY not configured");
    }

    // Method 1: Try direct text-to-video models first
    console.log("[generate-video] Trying text-to-video models...");
    const t2vResult = await tryTextToVideo(HUGGINGFACE_API_KEY, prompt);
    
    if (t2vResult.success && t2vResult.frames) {
      return new Response(
        JSON.stringify({
          frames: t2vResult.frames,
          type: "video",
          model: "huggingface-text-to-video",
          fps: 8,
          quality: "high",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Method 2: SVD pipeline (generate image → animate with SVD)
    console.log("[generate-video] Trying SVD pipeline (image → video)...");
    
    const baseImage = await generateBaseImage(HUGGINGFACE_API_KEY, prompt);
    
    if (baseImage) {
      console.log("[generate-video] Base image ready, animating with SVD...");
      const svdResult = await animateWithSVD(HUGGINGFACE_API_KEY, baseImage);
      
      if (svdResult.success && svdResult.frames) {
        return new Response(
          JSON.stringify({
            frames: svdResult.frames,
            type: "video",
            model: "stable-video-diffusion",
            fps: 8,
            quality: "high",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // If SVD failed but we have base image, return it as single frame
      console.log("[generate-video] SVD failed, returning base image as fallback");
      const imageBytes = new Uint8Array(await baseImage.arrayBuffer());
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < imageBytes.length; i += chunkSize) {
        const chunk = imageBytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const imageDataUrl = `data:image/png;base64,${btoa(binary)}`;
      
      return new Response(
        JSON.stringify({
          frames: [imageDataUrl],
          type: "image-fallback",
          model: "sdxl-base",
          fps: 1,
          quality: "high",
          note: "SVD unavailable, showing base image",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("All video generation methods failed");
  } catch (error) {
    console.error("[generate-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
