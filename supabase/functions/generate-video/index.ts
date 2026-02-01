import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    console.log("[generate-video] Generating video for prompt:", prompt.substring(0, 100));

    const HUGGINGFACE_API_KEY = Deno.env.get("HUGGINGFACE_API_KEY");
    if (!HUGGINGFACE_API_KEY) {
      throw new Error("HUGGINGFACE_API_KEY is not configured");
    }

    // Step 1: Generate an initial image using Stable Diffusion XL
    // SVD requires an input image for image-to-video generation
    console.log("[generate-video] Step 1: Generating initial frame with SDXL...");
    
    const imageResponse = await fetch(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: `Cinematic still frame, high quality, dynamic composition: ${prompt}`,
          parameters: {
            num_inference_steps: 25,
            guidance_scale: 7.5,
          },
        }),
      }
    );

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error("[generate-video] Image generation error:", imageResponse.status, errorText);
      
      if (imageResponse.status === 503) {
        return new Response(
          JSON.stringify({ 
            error: "Model is loading. Please try again in a few seconds.",
            status: "loading"
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`Image generation failed: ${imageResponse.status}`);
    }

    const imageBlob = await imageResponse.blob();
    const imageArrayBuffer = await imageBlob.arrayBuffer();
    const imageBase64 = btoa(
      new Uint8Array(imageArrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    console.log("[generate-video] Step 2: Generating video with Stable Video Diffusion...");

    // Step 2: Use the image with Stable Video Diffusion
    const videoResponse = await fetch(
      "https://api-inference.huggingface.co/models/stabilityai/stable-video-diffusion-img2vid-xt",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: imageBase64,
          parameters: {
            num_frames: 25,
            fps: 7,
            motion_bucket_id: 127,
            noise_aug_strength: 0.02,
          },
        }),
      }
    );

    if (!videoResponse.ok) {
      const errorText = await videoResponse.text();
      console.error("[generate-video] SVD error:", videoResponse.status, errorText);
      
      if (videoResponse.status === 503) {
        // Model is loading - return the image as a fallback with status
        return new Response(
          JSON.stringify({ 
            error: "Video model is loading. Returning preview image instead.",
            imageUrl: `data:image/png;base64,${imageBase64}`,
            status: "model_loading"
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (videoResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // If SVD fails, return the generated image
      console.log("[generate-video] SVD unavailable, returning generated image");
      return new Response(
        JSON.stringify({ 
          imageUrl: `data:image/png;base64,${imageBase64}`,
          type: "image",
          message: "Video generation temporarily unavailable. Here's the generated frame."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get video bytes and encode
    const videoBlob = await videoResponse.blob();
    const videoArrayBuffer = await videoBlob.arrayBuffer();
    const videoBytes = new Uint8Array(videoArrayBuffer);
    
    // Encode video to base64 in chunks to avoid stack overflow
    let videoBinary = '';
    const chunkSize = 8192;
    for (let i = 0; i < videoBytes.length; i += chunkSize) {
      const chunk = videoBytes.subarray(i, i + chunkSize);
      videoBinary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const videoBase64 = btoa(videoBinary);
    const videoUrl = `data:video/mp4;base64,${videoBase64}`;

    console.log("[generate-video] Video generated successfully");

    return new Response(
      JSON.stringify({ 
        videoUrl,
        type: "video",
        model: "stable-video-diffusion"
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
