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

    // Use Lovable AI Gateway for video generation (no external API key needed)
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // First, generate a high-quality cinematic frame using image generation
    console.log("[generate-video] Generating cinematic frame...");
    
    const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: `Create a cinematic, high-quality, dynamic still frame for this video concept: ${prompt}. Make it visually striking with dramatic lighting, compelling composition, and movement-suggesting elements as if frozen mid-action.`
          }
        ],
        modalities: ["image", "text"]
      })
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error("[generate-video] Image generation error:", imageResponse.status, errorText);
      
      if (imageResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (imageResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`Image generation failed: ${imageResponse.status}`);
    }

    const imageData = await imageResponse.json();
    const imageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      throw new Error("No image generated");
    }

    console.log("[generate-video] Frame generated, creating animated video sequence...");

    // For video, we generate multiple frames to simulate animation
    // This creates a GIF-like experience with the available tools
    const frames = [imageUrl];
    
    // Generate 2 additional variation frames for animation effect
    const variationPromises = [1, 2].map(async (i) => {
      try {
        const varResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [
              {
                role: "user",
                content: `Create frame ${i + 1} of an animation sequence for: ${prompt}. Show subtle motion and progression from the previous frame. Maintain consistent style, lighting, and subject but with slight movement or camera shift.`
              }
            ],
            modalities: ["image", "text"]
          })
        });
        
        if (varResponse.ok) {
          const varData = await varResponse.json();
          const varUrl = varData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (varUrl) return varUrl;
        }
        return null;
      } catch (e) {
        console.error(`[generate-video] Frame ${i + 1} generation failed:`, e);
        return null;
      }
    });

    const additionalFrames = await Promise.all(variationPromises);
    additionalFrames.forEach(frame => {
      if (frame) frames.push(frame);
    });

    console.log(`[generate-video] Generated ${frames.length} frames for animation`);

    // Return the frames as a video-like response
    // The frontend can display these as an animated sequence
    return new Response(
      JSON.stringify({ 
        videoUrl: frames[0], // Primary frame
        frames: frames, // All frames for animation
        type: "animated-frames",
        frameCount: frames.length,
        model: "gemini-2.5-flash-image",
        message: `Generated ${frames.length}-frame animation sequence`
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
