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
    const { type, userId, data } = await req.json();

    console.log("Generating AI insight:", { type, userId });

    // Fetch user attendance history
    const { data: attendanceData, error: fetchError } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("user_id", userId)
      .order("timestamp", { ascending: false })
      .limit(30);

    if (fetchError) throw fetchError;

    let systemPrompt = "";
    let userPrompt = "";

    switch (type) {
      case "attendance_prediction":
        systemPrompt = "You are an AI attendance analyst. Analyze patterns and predict attendance likelihood.";
        userPrompt = `Based on this attendance history: ${JSON.stringify(attendanceData)}, predict the likelihood of attendance for the next 7 days. Return a JSON object with: { "prediction": "high/medium/low", "confidence": 0-1, "insights": ["insight1", "insight2"], "recommendations": ["rec1", "rec2"] }`;
        break;
      
      case "anomaly_detection":
        systemPrompt = "You are an AI security analyst detecting unusual attendance patterns.";
        userPrompt = `Analyze this attendance data for anomalies: ${JSON.stringify(attendanceData)}. Look for suspicious patterns, unusual times, or irregularities. Return JSON: { "anomalies": [{"type": "string", "severity": "high/medium/low", "description": "string"}], "confidence": 0-1 }`;
        break;
      
      case "performance_insights":
        systemPrompt = "You are an AI performance analyst providing actionable attendance insights.";
        userPrompt = `Analyze attendance patterns: ${JSON.stringify(attendanceData)}. Provide insights on: consistency, trends, areas for improvement. Return JSON: { "overallScore": 0-100, "trends": ["trend1"], "strengths": ["str1"], "improvements": ["imp1"] }`;
        break;
      
      default:
        systemPrompt = "You are a helpful AI assistant.";
        userPrompt = JSON.stringify(data);
    }

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const content = JSON.parse(aiResult.choices[0].message.content);

    // Store insight
    const { error: insertError } = await supabase
      .from("ai_insights")
      .insert({
        user_id: userId,
        insight_type: type,
        data: content,
        confidence: content.confidence || 0.8
      });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, insight: content }), {
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