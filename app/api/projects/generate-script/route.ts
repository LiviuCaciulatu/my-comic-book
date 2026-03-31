import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ProjectStoryPage = {
  page?: number;
  beat?: number;
  title?: string;
  page_type?: string;
  page_description?: string;
};

function getPanelCountForStoryType(pageType: string): number {
  switch (pageType) {
    case "intro":
      return 3;
    case "dialogue":
      return 5;
    case "action":
      return 4;
    case "transition":
      return 2;
    case "reveal":
      return 1;
    case "climax":
      return 1;
    case "resolution":
      return 2;
    default:
      return 4;
  }
}

function getLayoutKeyForPanelCount(panelCount: number): string {
  switch (panelCount) {
    case 1:
      return "splash";
    case 2:
      return "cinematic_3";
    case 3:
      return "cinematic_3";
    case 4:
      return "classic_4";
    case 5:
      return "classic_5";
    default:
      return "classic_6";
  }
}

export async function POST(req: Request) {
  try {
    const { project_id } = await req.json();

    if (!project_id) {
      return NextResponse.json(
        { error: "Missing project_id" },
        { status: 400 }
      );
    }

    // Get user session
    const serverClient = await createSupabaseServerClient();
    const { data: { user } } = await serverClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const adminClient = createSupabaseAdminClient();

    // Fetch project
    console.log("[Comic Script] Fetching project:", project_id);
    const { data: project, error: projectError } = await adminClient
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .eq("client_id", user.id)
      .single();

    if (projectError || !project) {
      console.error("[Comic Script] Failed to fetch project:", projectError);
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    console.log("[Comic Script] Project fetched:", project);

    // Fetch character
    console.log("[Comic Script] Fetching character:", project.main_character_id);
    const { data: character, error: characterError } = await adminClient
      .from("character_identities")
      .select("*")
      .eq("id", project.main_character_id)
      .single();

    if (characterError || !character) {
      console.error("[Comic Script] Failed to fetch character:", characterError);
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 }
      );
    }

    console.log("[Comic Script] Character fetched:", character);

    // Fetch first storyboard entry (note: table is intentionally misspelled as storyboad_outlines)
    console.log("[Comic Script] Fetching first storyboard from storyboad_outlines...");

    const { data: storyboard, error: storyboardError } = await adminClient
      .from("storyboad_outlines")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (storyboardError || !storyboard) {
      console.error("[Comic Script] Failed to fetch storyboard:", storyboardError);
      return NextResponse.json(
        { error: "Storyboard not found in storyboad_outlines." },
        { status: 404 }
      );
    }

    console.log("[Comic Script] Storyboard fetched:", storyboard);

    // Build prompt
    const beatsJson = storyboard.beats_json || "[]";
    const prompt = `You are a professional comic book writer.

Your task is to transform a fixed storyboard into a PAGE-LEVEL comic script.

CRITICAL RULE:
The storyboard structure is AUTHORITATIVE and MUST NOT be changed.

PROJECT

Title: ${project.title}
Genre: ${project.genre}
Age Group: ${project.age_group}
Language: ${project.text_language}

Short Idea:
"${project.short_idea}"

Synopsis:
"${project.synopsis}"

CHARACTER

Name: ${character.name}
Age: ${character.age}
Role: ${project.main_character_role}
Traits: ${character.personality_traits || "unspecified"}

STORYBOARD

${typeof beatsJson === "string" ? beatsJson : JSON.stringify(beatsJson)}

PAGE PLAN

Total pages (excluding cover pages): ${project.page_count - 2}

You will distribute pages across storyboard beats proportionally.

PAGE TYPES (STRICT ENUM - MUST USE ONLY THESE VALUES)

- intro        (world setup, calm scenes)
- dialogue     (conversation-driven scenes)
- action       (movement, conflict, chase, fight)
- transition   (movement between scenes, travel, time passing)
- reveal       (discovery, surprise, realization)
- climax       (peak tension, biggest moment)
- resolution   (ending, calm closure)

TASK

For each storyboard beat:
- Determine how many pages it should occupy based on narrative importance
- Generate page-level descriptions for those pages
- Assign a page_type from the list above
- Keep story progression strictly aligned with beat order
- Do NOT skip or merge beats

Each page must:
- Represent a unique moment within the beat
- Progress the visual narrative forward
- Avoid repetition across pages

OUTPUT FORMAT (STRICT JSON)

{
  "project_story": [
    {
      "page": number,
      "beat": number,
      "title": "short beat title",
      "page_type": "",
      "page_description": "narrative description for this specific page"
    }
  ]
}

RULES:
- Output must contain exactly ${project.page_count - 2} pages
- Pages must be in correct order
- page_type MUST be one of the predefined values
- No extra fields
- No extra text
- Language: ${project.text_language}`;

    console.log("[Comic Script] Built prompt:", prompt);

    // Call OpenAI
    console.log("[Comic Script] Calling OpenAI...");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    console.log("[Comic Script] OpenAI response:", response);

    // Extract content
    const message = response.choices[0];
    if (!message.message || !message.message.content) {
      throw new Error("Unexpected OpenAI response type");
    }

    const content = typeof message.message.content === "string" 
      ? message.message.content 
      : message.message.content;

    // Parse JSON, stripping markdown if present
    let projectScript;
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith("```json")) {
      cleanedContent = cleanedContent.slice(7); // Remove ```json
    }
    if (cleanedContent.startsWith("```")) {
      cleanedContent = cleanedContent.slice(3); // Remove ```
    }
    if (cleanedContent.endsWith("```")) {
      cleanedContent = cleanedContent.slice(0, -3); // Remove trailing ```
    }

    try {
      const parsed = JSON.parse(cleanedContent);
      projectScript = parsed.project_story || parsed;
      console.log("[Comic Script] Parsed project script:", projectScript);
    } catch (parseError) {
      console.error("[Comic Script] Failed to parse OpenAI response:", parseError);
      console.error("[Comic Script] Raw content:", cleanedContent);
      return NextResponse.json(
        { error: "Failed to parse script response" },
        { status: 500 }
      );
    }

    // Update project with script and selected storyboard id
    console.log("[Comic Script] Updating project with script and story_outline_id...", storyboard.id);
    const { data: updatedProject, error: updateError } = await adminClient
      .from("projects")
      .update({
        project_story: projectScript,
        story_outline_id: storyboard.id,
      })
      .eq("id", project_id)
      .select()
      .single();

    if (updateError) {
      console.error("[Comic Script] Failed to update project:", updateError);
      return NextResponse.json(
        { error: "Failed to save script to database" },
        { status: 500 }
      );
    }

    console.log("[Comic Script] Project updated successfully:", updatedProject);

    const storyPages = Array.isArray(projectScript)
      ? (projectScript as ProjectStoryPage[])
      : [];
    const expectedStoryPages = project.page_count - 2;

    if (storyPages.length !== expectedStoryPages) {
      console.error("[Comic Script] Project story page count mismatch:", {
        expectedStoryPages,
        receivedStoryPages: storyPages.length,
        projectStory: storyPages,
      });
      return NextResponse.json(
        {
          error: `Project story must contain exactly ${expectedStoryPages} story pages.`,
        },
        { status: 500 }
      );
    }

    const pageRows = Array.from({ length: project.page_count }, (_, index) => {
      const pageNumber = index + 1;

      if (pageNumber === 1) {
        return {
          project_id: project_id,
          page_number: pageNumber,
          page_type: "cover",
          step_page_index: null,
          story_step: null,
          story_step_title: null,
          story_beat_title: null,
          page_description: null,
          panel_count: 1,
          layout_key: "splash",
          is_splash_page: true,
          page_prompt: null,
          image_prompt: null,
          updated_at: new Date().toISOString(),
        };
      }

      if (pageNumber === project.page_count) {
        return {
          project_id: project_id,
          page_number: pageNumber,
          page_type: "back",
          step_page_index: null,
          story_step: null,
          story_step_title: null,
          story_beat_title: null,
          page_description: null,
          panel_count: 1,
          layout_key: "splash",
          is_splash_page: true,
          page_prompt: null,
          image_prompt: null,
          updated_at: new Date().toISOString(),
        };
      }

      const storyPage = storyPages[pageNumber - 2];
      const storyType = String(storyPage?.page_type ?? "").trim();
      const panelCount = getPanelCountForStoryType(storyType);

      return {
        project_id: project_id,
        page_number: pageNumber,
        page_type: "story",
        step_page_index: null,
        story_step: null,
        story_step_title: null,
        story_beat_title: String(storyPage?.title ?? "").trim() || null,
        page_description: String(storyPage?.page_description ?? "").trim() || null,
        panel_count: panelCount,
        layout_key: getLayoutKeyForPanelCount(panelCount),
        is_splash_page: panelCount === 1,
        page_prompt: null,
        image_prompt: null,
        updated_at: new Date().toISOString(),
      };
    });

    console.log("[Comic Script] Generated project_pages rows:", pageRows);

    const { error: deletePagesError } = await adminClient
      .from("project_pages")
      .delete()
      .eq("project_id", project_id);

    if (deletePagesError) {
      console.error("[Comic Script] Failed to clear existing project_pages:", deletePagesError);
      return NextResponse.json(
        { error: "Failed to clear existing project pages." },
        { status: 500 }
      );
    }

    console.log("[Comic Script] Inserting project_pages into database...");
    const { data: insertedPages, error: insertPagesError } = await adminClient
      .from("project_pages")
      .insert(pageRows)
      .select("id, page_number, page_type, story_beat_title, panel_count, layout_key");

    if (insertPagesError) {
      console.error("[Comic Script] Failed to insert project_pages:", insertPagesError);
      return NextResponse.json(
        { error: "Failed to save project pages to database." },
        { status: 500 }
      );
    }

    console.log("[Comic Script] Inserted project_pages:", insertedPages);

    return NextResponse.json({
      success: true,
      projectScript,
      projectId: project_id,
      projectPages: insertedPages,
    });
  } catch (error) {
    console.error("[Comic Script] Unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
