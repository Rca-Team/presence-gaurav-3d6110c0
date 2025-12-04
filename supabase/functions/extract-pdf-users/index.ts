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
    const { fileData, fileName, fileType } = await req.json();

    if (!fileData) {
      console.error("No file data provided");
      return new Response(
        JSON.stringify({ error: "No file data provided", users: [] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured. Please contact support.", users: [] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing file: ${fileName}, type: ${fileType}, data length: ${fileData?.length || 0}`);

    // Prepare the prompt for extraction
    const systemPrompt = `You are an AI assistant specialized in extracting user information from documents.
Your task is to analyze the provided document (PDF content or image) and extract all user/student/employee information.

For each person found, extract:
- name: Full name of the person
- employee_id or student_id: Any ID number associated with them (if not found, generate a unique one like STU-001, STU-002, etc.)
- department: Department, class, section, or batch
- position: Role, grade, designation, or year (default to "Student" if not specified)
- photo_url: If there's an embedded image URL for the person (leave empty if not found)

IMPORTANT: 
- Extract ALL people visible in the document, even if information is partial
- Look for tables, lists, ID cards, forms, or any structured data
- If names are in a list format, extract each one
- Generate sequential IDs if not provided (STU-001, STU-002, etc.)

Return the data as a JSON object with this exact structure:
{
  "users": [
    {
      "name": "John Doe",
      "employee_id": "STU-001",
      "department": "Computer Science",
      "position": "Student",
      "photo_url": ""
    }
  ],
  "total_extracted": 1
}

If you cannot extract any users, return: {"users": [], "total_extracted": 0, "reason": "explanation"}
Only return valid JSON, no explanations or markdown.`;

    // Call Lovable AI Gateway
    console.log("Calling Lovable AI Gateway...");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: [
              {
                type: "text",
                text: `Please analyze this document and extract all user/student information. The file is named "${fileName}" (type: ${fileType}). Look carefully for names, IDs, departments, and any other relevant details.`
              },
              {
                type: "image_url",
                image_url: {
                  url: fileData
                }
              }
            ]
          }
        ],
        max_tokens: 8192,
      }),
    });

    console.log(`AI Gateway response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again.", users: [] }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue.", users: [] }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `AI processing failed (${response.status})`, users: [] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    console.log("AI Response received, length:", content.length);
    console.log("AI Response preview:", content.substring(0, 500));

    // Parse the JSON response
    let extractedData;
    try {
      // Remove any markdown code blocks if present
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.slice(7);
      } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.slice(3);
      }
      if (cleanedContent.endsWith("```")) {
        cleanedContent = cleanedContent.slice(0, -3);
      }
      cleanedContent = cleanedContent.trim();
      
      // Try to extract JSON from the response
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
        console.log(`Successfully parsed ${extractedData.users?.length || 0} users`);
      } else {
        console.warn("No JSON object found in response");
        extractedData = { users: [], reason: "No structured data found in AI response" };
      }
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Content that failed to parse:", content.substring(0, 1000));
      extractedData = { users: [], error: "Failed to parse AI response" };
    }

    // Ensure users array exists
    if (!extractedData.users) {
      extractedData.users = [];
    }

    // Validate and clean up user data
    extractedData.users = extractedData.users.map((user: any, index: number) => ({
      name: user.name || `Person ${index + 1}`,
      employee_id: user.employee_id || user.student_id || `STU-${String(index + 1).padStart(3, '0')}`,
      department: user.department || user.class || '',
      position: user.position || user.grade || 'Student',
      photo_url: user.photo_url || user.image_url || ''
    }));

    console.log(`Returning ${extractedData.users.length} extracted users`);

    return new Response(
      JSON.stringify(extractedData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in extract-pdf-users:", errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage, users: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
