import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { userId, context } = await req.json();

    console.log("Generating smart notification:", { userId, context });

    // Get user data and recent activity
    const { data: userData } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    const { data: recentAttendance } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("user_id", userId)
      .order("timestamp", { ascending: false })
      .limit(5);

    // Generate personalized notification using AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { 
            role: "system", 
            content: "You are a helpful AI assistant that creates personalized, friendly, and actionable notifications for students." 
          },
          { 
            role: "user", 
            content: `Create a personalized notification for ${userData?.display_name || 'Student'}. Context: ${context}. Recent attendance: ${JSON.stringify(recentAttendance)}. Return JSON: { "title": "string", "message": "string", "type": "info/warning/success", "actionable": true/false }` 
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const notification = JSON.parse(aiResult.choices[0].message.content);

    // Store notification
    const { error: insertError } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        data: { actionable: notification.actionable, context }
      });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, notification }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});