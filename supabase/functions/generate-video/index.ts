import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Use the new HuggingFace router endpoint
const HF_ROUTER_BASE = "https://router.huggingface.co/hf-inference/models";

// Wan 2.1 model - text-to-video
const WAN_MODEL = "Wan-AI/Wan2.1-T2V-14B";

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

// Detect content type from response headers or magic bytes
function detectContentType(contentType: string, bytes: Uint8Array): string {
  if (contentType.includes("mp4")) return "video/mp4";
  if (contentType.includes("webm")) return "video/webm";
  if (contentType.includes("gif")) return "image/gif";
  if (contentType.includes("png")) return "image/png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "image/jpeg";
  
  // Check magic bytes
  if (bytes.length >= 8) {
    // MP4: check for ftyp at offset 4
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
  
  return "video/mp4"; // Default assumption
}

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Generate video using Wan 2.1 with retry logic for 503 (model loading)
async function generateWithWan(
  apiKey: string,
  prompt: string,
  maxRetries: number = 5
): Promise<{ success: boolean; dataUrl?: string; error?: string; estimatedTime?: number }> {
  
  const url = `${HF_ROUTER_BASE}/${WAN_MODEL}`;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[generate-video] Wan 2.1 attempt ${attempt}/${maxRetries}`);
    
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: prompt }),
      });
      
      console.log(`[generate-video] Wan 2.1 status: ${response.status}`);
      
      // Handle 503 - Model Loading
      if (response.status === 503) {
        const errorData = await response.json().catch(() => ({}));
        const estimatedTime = errorData.estimated_time || 30;
        
        console.log(`[generate-video] Model loading, estimated time: ${estimatedTime}s`);
        
        if (attempt < maxRetries) {
          // Wait for the estimated time plus a small buffer
          const waitTime = Math.min(estimatedTime * 1000 + 5000, 120000); // Max 2 min wait
          console.log(`[generate-video] Waiting ${waitTime / 1000}s before retry...`);
          await sleep(waitTime);
          continue;
        }
        
        return {
          success: false,
          error: `Model is loading. Estimated time: ${estimatedTime}s. Please try again.`,
          estimatedTime,
        };
      }
      
      // Handle other errors
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        console.log(`[generate-video] Wan 2.1 error: ${errorText.substring(0, 200)}`);
        
        // If it's a rate limit or temporary error, retry
        if (response.status === 429 || response.status >= 500) {
          if (attempt < maxRetries) {
            await sleep(10000); // Wait 10s before retry
            continue;
          }
        }
        
        return { success: false, error: `API error: ${response.status}` };
      }
      
      // Check content type
      const contentType = response.headers.get("content-type") || "";
      
      // If JSON response, it might be an error or queue status
      if (contentType.includes("application/json")) {
        const jsonData = await response.json();
        console.log(`[generate-video] Wan 2.1 JSON response:`, JSON.stringify(jsonData).substring(0, 200));
        
        if (jsonData.error) {
          return { success: false, error: jsonData.error };
        }
        
        // Some models return base64 in JSON
        if (jsonData.video || jsonData.output) {
          const videoData = jsonData.video || jsonData.output;
          if (typeof videoData === 'string') {
            const dataUrl = videoData.startsWith('data:') 
              ? videoData 
              : `data:video/mp4;base64,${videoData}`;
            return { success: true, dataUrl };
          }
        }
        
        return { success: false, error: "Unexpected JSON response" };
      }
      
      // Binary response - this is the video!
      const bytes = new Uint8Array(await response.arrayBuffer());
      
      if (bytes.length < 1000) {
        console.log(`[generate-video] Response too small: ${bytes.length} bytes`);
        return { success: false, error: "Response too small to be a valid video" };
      }
      
      const mimeType = detectContentType(contentType, bytes);
      const dataUrl = bufferToDataUrl(bytes, mimeType);
      
      console.log(`[generate-video] Wan 2.1 success: ${bytes.length} bytes, type: ${mimeType}`);
      return { success: true, dataUrl };
      
    } catch (error) {
      console.error(`[generate-video] Wan 2.1 exception:`, error);
      
      if (attempt < maxRetries) {
        await sleep(5000);
        continue;
      }
      
      return { success: false, error: error instanceof Error ? error.message : "Network error" };
    }
  }
  
  return { success: false, error: "Max retries exceeded" };
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

    const HF_TOKEN = Deno.env.get("HUGGINGFACE_API_KEY");

    if (!HF_TOKEN) {
      return new Response(
        JSON.stringify({ error: "HUGGINGFACE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate using Wan 2.1
    console.log("[generate-video] Using Wan 2.1 text-to-video model...");
    const result = await generateWithWan(HF_TOKEN, prompt);
    
    if (result.success && result.dataUrl) {
      const isVideo = result.dataUrl.includes("video/");
      return new Response(
        JSON.stringify({
          frames: [result.dataUrl],
          type: isVideo ? "video" : "image",
          model: "wan-2.1-t2v",
          fps: 24,
          quality: "high",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return error with estimated time if available (for UI countdown)
    return new Response(
      JSON.stringify({
        error: result.error || "Video generation failed",
        estimatedTime: result.estimatedTime,
        retryable: !!result.estimatedTime,
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
