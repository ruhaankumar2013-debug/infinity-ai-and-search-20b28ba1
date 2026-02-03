import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate video using Hugging Face Stable Video Diffusion
async function generateWithSVD(
  apiKey: string,
  prompt: string
): Promise<{ success: boolean; frames?: string[]; error?: string }> {
  // SVD models to try - these return frame sequences, NOT MP4
  const models = [
    "stabilityai/stable-video-diffusion-img2vid-xt",
    "stabilityai/stable-video-diffusion-img2vid",
    "ali-vilab/text-to-video-ms-1.7b",
    "damo-vilab/text-to-video-ms-1.7b",
    "cerspense/zeroscope_v2_576w",
  ];

  for (const model of models) {
    try {
      console.log(`[generate-video] Trying HuggingFace SVD model: ${model}`);
      
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
              fps: 8,
            },
          }),
        }
      );

      const contentType = response.headers.get("content-type") || "";
      console.log(`[generate-video] ${model} response status: ${response.status}, content-type: ${contentType}`);

      if (response.ok) {
        // SVD returns frame sequences - handle various output formats
        
        // Case 1: Binary image/video data (GIF or frame sequence)
        if (contentType.includes("image") || contentType.includes("video") || contentType.includes("octet-stream")) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, Array.from(chunk));
          }
          
          // Determine format from content-type or magic bytes
          let mimeType = "image/gif";
          if (contentType.includes("mp4") || contentType.includes("video")) {
            mimeType = "video/mp4";
          } else if (contentType.includes("webp")) {
            mimeType = "image/webp";
          } else if (contentType.includes("png")) {
            mimeType = "image/png";
          }
          
          const dataUrl = `data:${mimeType};base64,${btoa(binary)}`;
          console.log(`[generate-video] ${model} returned binary data as ${mimeType}`);
          return { success: true, frames: [dataUrl] };
        }
        
        // Case 2: JSON response with frames array or tensor data
        if (contentType.includes("json")) {
          const json = await response.json();
          console.log(`[generate-video] ${model} returned JSON:`, Object.keys(json));
          
          // Handle array of frame URLs
          if (Array.isArray(json)) {
            const frames = json.map((item: any) => {
              if (typeof item === "string") return item;
              if (item.url) return item.url;
              if (item.image) return item.image;
              if (item.frame) return item.frame;
              return null;
            }).filter(Boolean);
            
            if (frames.length > 0) {
              console.log(`[generate-video] ${model} returned ${frames.length} frames`);
              return { success: true, frames };
            }
          }
          
          // Handle object with frames/video property
          if (json.frames && Array.isArray(json.frames)) {
            console.log(`[generate-video] ${model} returned ${json.frames.length} frames in object`);
            return { success: true, frames: json.frames };
          }
          
          if (json.video_url || json.url) {
            return { success: true, frames: [json.video_url || json.url] };
          }
          
          // Handle base64 encoded frames
          if (json.images && Array.isArray(json.images)) {
            const frames = json.images.map((img: string) => 
              img.startsWith("data:") ? img : `data:image/png;base64,${img}`
            );
            return { success: true, frames };
          }
        }
        
        // Case 3: Try to read as raw binary anyway
        try {
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length > 100) {
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              const chunk = bytes.subarray(i, i + chunkSize);
              binary += String.fromCharCode.apply(null, Array.from(chunk));
            }
            const dataUrl = `data:image/gif;base64,${btoa(binary)}`;
            console.log(`[generate-video] ${model} returned raw binary, treating as GIF`);
            return { success: true, frames: [dataUrl] };
          }
        } catch {
          // Ignore parsing errors
        }
      } else {
        const errorText = await response.text().catch(() => "");
        console.log(`[generate-video] ${model} failed: ${response.status} ${errorText.substring(0, 300)}`);
        
        // If model is loading, wait and retry
        if (response.status === 503 && errorText.includes("loading")) {
          console.log(`[generate-video] Model ${model} is loading, waiting 20s...`);
          await new Promise(r => setTimeout(r, 20000));
          // Don't continue to next model, retry this one
          continue;
        }
      }
    } catch (error) {
      console.error(`[generate-video] ${model} error:`, error);
    }
  }

  return { success: false, error: "No HuggingFace SVD models available" };
}

// Fallback: Generate SDXL frames for animation
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
      console.error(`[generate-video] SDXL frame ${frameNumber + 1} error:`, response.status);
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

    console.log("[generate-video] Generating video with SVD for:", prompt.substring(0, 100));

    const HUGGINGFACE_API_KEY = Deno.env.get("HUGGINGFACE_API_KEY");
    const CLOUDFLARE_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const CLOUDFLARE_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN");

    // Try HuggingFace Stable Video Diffusion first
    if (HUGGINGFACE_API_KEY) {
      console.log("[generate-video] Using HuggingFace Stable Video Diffusion...");
      const svdResult = await generateWithSVD(HUGGINGFACE_API_KEY, prompt);
      
      if (svdResult.success && svdResult.frames && svdResult.frames.length > 0) {
        console.log(`[generate-video] SVD success with ${svdResult.frames.length} frames`);
        return new Response(
          JSON.stringify({
            frames: svdResult.frames,
            type: "frame-sequence",
            model: "huggingface-svd",
            frameCount: svdResult.frames.length,
            fps: 8,
            duration: svdResult.frames.length / 8,
            quality: "high",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("[generate-video] SVD failed, falling back to SDXL frames");
    }

    // Fallback to SDXL frame generation
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
      throw new Error("Neither HuggingFace SVD nor Cloudflare SDXL is configured");
    }

    const numFrames = Math.min(Math.max(frameCount, 8), 40);
    console.log(`[generate-video] Generating ${numFrames} SDXL frames as fallback...`);

    const frames = await generateSDXLFrames(
      CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN,
      prompt,
      numFrames
    );

    if (frames.length === 0) {
      throw new Error("Failed to generate any frames");
    }

    console.log(`[generate-video] SDXL generated ${frames.length}/${numFrames} frames`);

    return new Response(
      JSON.stringify({
        frames: frames,
        type: "frame-sequence",
        model: "sdxl-fallback",
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
