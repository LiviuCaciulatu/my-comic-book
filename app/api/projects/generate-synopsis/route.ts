import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type GenerateSynopsisPayload = {
  project_id?: string;
  short_idea: string;
  age_group: string;
  genre: string;
  main_character_id: string;
  main_character_role: string;
  text_language: string;
  series_name?: string;
  issue_number?: number;
};

export async function POST(req: Request) {
  const serverClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: GenerateSynopsisPayload;
  try {
    payload = (await req.json()) as GenerateSynopsisPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Fetch character data
  console.log("📌 Fetching character data for ID:", payload.main_character_id);
  const { data: character, error: characterError } = await admin
    .from("character_identities")
    .select("id, name, age, gender")
    .eq("id", payload.main_character_id)
    .eq("client_id", user.id)
    .eq("is_active", true)
    .single();

  if (characterError || !character) {
    console.error("❌ Character fetch error:", characterError);
    return NextResponse.json(
      { error: "Character not found." },
      { status: 400 },
    );
  }

  console.log("✅ Character fetched:", character);

  // Build the prompt
  const prompt = `You are a professional comic book writer and creative director specializing in commercial publishing for children, middle-grade and highschool audiences. Your task is to create a compelling short story synopsis for a comic book issue based on the following information.

Requirements:
- Write in ${payload.text_language}.
- Adapt tone, vocabulary, and emotional depth to the target age group: ${payload.age_group}.
- Use the main character's details:
Name: ${character.name}
Age: ${character.age}
Gender: ${character.gender || "unspecified"}
Role: ${payload.main_character_role}
- Incorporate the genre: ${payload.genre}.
- Based on user's short idea: "${payload.short_idea}".
- Include series and issue info if provided:
${payload.series_name ? `Series: ${payload.series_name}` : ""}
${payload.issue_number ? `Issue: #${payload.issue_number}` : ""}
- Focus on the core story arc: protagonist, central conflict, stakes, and hint at escalation or resolution.
- Include a protagonist goal
- Include an obstacle or conflict
- Include rising stakes
- Keep it short: 3–5 sentences maximum.
- Do NOT include visual descriptions or panel breakdowns.
- Return a JSON object strictly in the following format:

{
  "synopsis": ""
}

Do not include any extra text outside of the JSON.`;

  console.log("📝 Generated prompt:", prompt);

  // Call OpenAI
  const openai = new OpenAI();

  try {
    console.log("🔄 Calling OpenAI gpt-4o-mini...");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    console.log("✅ OpenAI response received:", response);

    const content = response.choices[0].message.content;
    console.log("📄 Response content:", content);

    if (!content) {
      console.error("❌ No content in OpenAI response");
      return NextResponse.json(
        { error: "No response from OpenAI." },
        { status: 500 },
      );
    }

    // Parse JSON response (strip markdown code blocks if present)
    let synopsisData;
    try {
      let jsonStr = content.trim();
      // Strip ```json and ``` if present
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
      }
      synopsisData = JSON.parse(jsonStr);
      console.log("✅ Parsed synopsis JSON:", synopsisData);
    } catch {
      console.error("❌ Failed to parse OpenAI JSON response:", content);
      return NextResponse.json(
        { error: "Invalid JSON response from OpenAI." },
        { status: 500 },
      );
    }

    const synopsis = synopsisData.synopsis;
    console.log("📋 Final synopsis:", synopsis);

    return NextResponse.json({
      success: true,
      synopsis,
    });
  } catch (error) {
    console.error("❌ OpenAI API error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate synopsis.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
