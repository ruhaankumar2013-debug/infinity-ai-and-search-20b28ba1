import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REPLICATE_API_URL = "https://api.replicate.com/v1/models/minimax/video-01/predictions";

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Check if user can generate video (1 per week for non-admins)
async function checkUserQuota(
  supabase: any,
  userId: string
): Promise<{ canGenerate: boolean; isAdmin: boolean; remainingDays?: number }> {
  
  // Check if user is admin
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  
  const isAdmin = !!roleData;
  
  if (isAdmin) {
    return { canGenerate: true, isAdmin: true };
  }
  
  // Check usage in the last 7 days
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const { data: usageData, error } = await supabase
    .from("video_generation_usage")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", oneWeekAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  
  if (error) {
    console.error("[generate-video] Error checking quota:", error);
    return { canGenerate: false, isAdmin: false };
  }
  
  if (usageData && usageData.length > 0) {
    // Calculate remaining days until next generation
    const lastGeneration = new Date(usageData[0].created_at);
    const nextAllowed = new Date(lastGeneration);
    nextAllowed.setDate(nextAllowed.getDate() + 7);
    const remainingMs = nextAllowed.getTime() - Date.now();
    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    
    return { canGenerate: false, isAdmin: false, remainingDays };
  }
  
  return { canGenerate: true, isAdmin: false };
}

// Record usage
async function recordUsage(supabase: any, userId: string, prompt: string) {
  await supabase.from("video_generation_usage").insert({
    user_id: userId,
    model: "minimax-video-01",
    prompt: prompt.substring(0, 500),
  });
}

// Generate video with Replicate minimax/video-01
async function generateWithReplicate(
  apiToken: string,
  prompt: string
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  
  console.log("[generate-video] Starting Replicate minimax/video-01 generation...");
  
  try {
    // Create prediction
    const createResponse = await fetch(REPLICATE_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "Prefer": "wait",
      },
      body: JSON.stringify({
        input: {
          prompt: prompt,
        },
      }),
    });
    
    console.log(`[generate-video] Create prediction status: ${createResponse.status}`);
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error("[generate-video] Replicate error:", errorText);
      return { success: false, error: `Replicate API error: ${createResponse.status}` };
    }
    
    let prediction = await createResponse.json();
    console.log(`[generate-video] Prediction status: ${prediction.status}`);
    
    // Poll for completion if not using "Prefer: wait"
    let pollCount = 0;
    const maxPolls = 120; // 10 minutes max
    
    while (prediction.status !== "succeeded" && prediction.status !== "failed" && pollCount < maxPolls) {
      await sleep(5000);
      pollCount++;
      
      const pollResponse = await fetch(prediction.urls.get, {
        headers: {
          "Authorization": `Bearer ${apiToken}`,
        },
      });
      
      if (!pollResponse.ok) {
        console.error("[generate-video] Poll error:", pollResponse.status);
        continue;
      }
      
      prediction = await pollResponse.json();
      console.log(`[generate-video] Poll ${pollCount}: ${prediction.status}`);
    }
    
    if (prediction.status === "succeeded" && prediction.output) {
      console.log("[generate-video] Video generated successfully!");
      const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      return { success: true, videoUrl };
    }
    
    if (prediction.status === "failed") {
      return { success: false, error: prediction.error || "Generation failed" };
    }
    
    return { success: false, error: "Generation timed out" };
    
  } catch (error) {
    console.error("[generate-video] Exception:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
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

    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!REPLICATE_API_TOKEN) {
      return new Response(
        JSON.stringify({ error: "REPLICATE_API_TOKEN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    
    if (authHeader && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      // Verify the JWT and get user
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Authentication required for video generation" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      userId = user.id;
      
      // Check quota
      const quota = await checkUserQuota(supabase, userId);
      
      if (!quota.canGenerate) {
        return new Response(
          JSON.stringify({ 
            error: `You've used your weekly video generation. Try again in ${quota.remainingDays} day(s).`,
            quotaExceeded: true,
            remainingDays: quota.remainingDays,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Generate video
      const result = await generateWithReplicate(REPLICATE_API_TOKEN, prompt);
      
      if (result.success && result.videoUrl) {
        // Record usage (only for non-admins, but we record anyway for tracking)
        await recordUsage(supabase, userId, prompt);
        
        return new Response(
          JSON.stringify({
            frames: [result.videoUrl],
            type: "video",
            model: "minimax-video-01",
            fps: 24,
            quality: "high",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: result.error || "Video generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // No auth - require login
    return new Response(
      JSON.stringify({ error: "Please sign in to generate videos" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[generate-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
