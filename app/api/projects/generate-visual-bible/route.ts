import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const serverClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createSupabaseAdminClient();

  const { project_id, character_id, style_key } = await req.json();

  console.log("[Visual Bible] Request received:", {
    project_id,
    character_id,
    style_key,
  });

  if (!project_id || !character_id || !style_key) {
    return NextResponse.json(
      { error: "Missing project_id, character_id, or style_key" },
      { status: 400 }
    );
  }

  try {
    // Fetch project data
    const { data: projectData, error: projectError } = await adminClient
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .single();

    if (projectError || !projectData) {
      console.error("[Visual Bible] Project fetch failed:", projectError);
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    console.log("[Visual Bible] Project fetched:", projectData);

    // Fetch character data
    const { data: characterData, error: characterError } = await adminClient
      .from("character_identities")
      .select("*")
      .eq("id", character_id)
      .eq("client_id", user.id)
      .single();

    if (characterError || !characterData) {
      console.error("[Visual Bible] Character fetch failed:", characterError);
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 }
      );
    }

    console.log("[Visual Bible] Character fetched:", characterData);

    // Fetch style preset data
    const { data: styleData, error: styleError } = await adminClient
      .from("style_presets")
      .select("*")
      .eq("id", style_key)
      .single();

    if (styleError || !styleData) {
      console.error("[Visual Bible] Style preset fetch failed:", styleError);
      return NextResponse.json(
        { error: "Style preset not found" },
        { status: 404 }
      );
    }

    console.log("[Visual Bible] Style preset fetched:", styleData);

    // Fetch main character role (if available)
    const main_character_role = projectData.main_character_role || "Hero";

    // Build the visual bible prompt
    const prompt = `You are a senior character designer and art director for children's comics.

Create a consistent VISUAL BIBLE for this comic project.

This output will be reused across all pages, so consistency is critical.

PROJECT

Title: ${projectData.title}
Genre: ${projectData.genre}
Project Type: ${projectData.project_type}
Age Group: ${projectData.age_group}
Language: ${projectData.text_language}

Short Idea:
"${projectData.short_idea}"

Synopsis:
"${projectData.synopsis}"

STYLE PRESET (HARD CONSTRAINT - DO NOT DEVIATE)

Style Name: ${styleData.style_name}

Style Prompt:
${styleData.prompt}

Visual Notes:
${styleData.visual_notes}

CHARACTER

Name: ${characterData.name}
Age: ${characterData.age}
Gender: ${characterData.gender || "unspecified"}
Role: ${main_character_role}

Traits:
- Personality: ${characterData.personality_traits || "unspecified"}
- Hair: ${characterData.hair_color}, ${characterData.hair_length}, ${characterData.hair_style}
- Eyes: ${characterData.eye_color}
- Skin: ${characterData.skin_tone}
- Face: ${characterData.face_shape || "default"}
- Features: ${characterData.distinctive_features || "none"}
- Outfit: ${characterData.outfit_preferences || "none"}

Base Description:
${characterData.base_description || "N/A"}

Reference Image:
${characterData.reference_face_image_path || "none"}

TASK

1. CHARACTER DESIGN
- Appearance (age-accurate)
- Hair & silhouette
- Outfit
- Color identity
- Expressions
- Iconic elements
- Silhouette definition
- Consistency notes

2. VISUAL DIRECTION
- Art style (must follow preset)
- Color palette
- Lighting
- Mood
- Environment
- Cinematic notes

OUTPUT (STRICT JSON ONLY)

{
  "character_design": {
    "description": "",
    "costume": "",
    "iconic_elements": "",
    "silhouette_notes": "",
    "notes": ""
  },
  "visual_direction": {
    "overall_style": "",
    "color_palette": "",
    "lighting": "",
    "mood": "",
    "environment_notes": "",
    "notes": ""
  }
}

No extra text.
All output in ${projectData.text_language}.`;

    console.log("[Visual Bible] Prompt built, calling OpenAI...");

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    console.log("[Visual Bible] OpenAI response received:", response);

    const content = response.choices[0]?.message?.content || "";
    console.log("[Visual Bible] OpenAI content:", content);

    // Parse JSON response (strip markdown code blocks if present)
    let visualBible;
    try {
      let jsonStr = content.trim();
      // Strip ```json and ``` if present
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
      }
      visualBible = JSON.parse(jsonStr);
      console.log("[Visual Bible] Parsed visual bible:", visualBible);
    } catch (parseError) {
      console.error("[Visual Bible] Failed to parse OpenAI response:", parseError);
      console.error("[Visual Bible] Raw content was:", content);
      return NextResponse.json(
        { error: "Failed to parse visual bible response" },
        { status: 500 }
      );
    }

    // Update project with character_design and visual_direction
    const { data: updatedProject, error: updateError } = await adminClient
      .from("projects")
      .update({
        character_design: visualBible.character_design || {},
        visual_direction: visualBible.visual_direction || {},
      })
      .eq("id", project_id)
      .select()
      .single();

    if (updateError) {
      console.error("[Visual Bible] Project update failed:", updateError);
      return NextResponse.json(
        { error: "Failed to save visual bible" },
        { status: 500 }
      );
    }

    console.log("[Visual Bible] Project updated successfully:", updatedProject);

    return NextResponse.json({
      success: true,
      visual_bible: visualBible,
      project: updatedProject,
    });
  } catch (error) {
    console.error("[Visual Bible] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to generate visual bible" },
      { status: 500 }
    );
  }
}
