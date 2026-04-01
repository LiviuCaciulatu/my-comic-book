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

type GeneratedPanel = {
  panel_number?: number;
  panel_type?: string;
  camera_angle?: string;
  composition?: string;
  action_description?: string;
  characters_present?: string;
  dialogue_text?: string;
  caption_text?: string;
  visual_focus?: string;
  layout_position?: string;
};

function extractJsonFromOpenAiContent(content: string): unknown {
  let cleanedContent = content.trim();

  if (cleanedContent.startsWith("```json")) {
    cleanedContent = cleanedContent.slice(7);
  }
  if (cleanedContent.startsWith("```")) {
    cleanedContent = cleanedContent.slice(3);
  }
  if (cleanedContent.endsWith("```")) {
    cleanedContent = cleanedContent.slice(0, -3);
  }

  return JSON.parse(cleanedContent.trim());
}

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

    try {
      const parsed = extractJsonFromOpenAiContent(content) as {
        project_story?: unknown;
      } & Record<string, unknown>;
      projectScript = parsed.project_story || parsed;
      console.log("[Comic Script] Parsed project script:", projectScript);
    } catch (parseError) {
      console.error("[Comic Script] Failed to parse OpenAI response:", parseError);
      console.error("[Comic Script] Raw content:", content);
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
      .select("id, page_number, page_type, page_description, story_beat_title, panel_count, layout_key");

    if (insertPagesError) {
      console.error("[Comic Script] Failed to insert project_pages:", insertPagesError);
      return NextResponse.json(
        { error: "Failed to save project pages to database." },
        { status: 500 }
      );
    }

    console.log("[Comic Script] Inserted project_pages:", insertedPages);

    const characterDesign =
      project.character_design && typeof project.character_design === "object"
        ? project.character_design
        : {};
    const visualDirection =
      project.visual_direction && typeof project.visual_direction === "object"
        ? project.visual_direction
        : {};

    const { error: deletePanelsError } = await adminClient
      .from("project_panels")
      .delete()
      .eq("project_id", project_id);

    if (deletePanelsError) {
      console.error("[Comic Script] Failed to clear existing project_panels:", deletePanelsError);
      return NextResponse.json(
        { error: "Failed to clear existing project panels." },
        { status: 500 }
      );
    }

    const panelRows: Array<Record<string, unknown>> = [];
    const maxPanelJsonRetries = 3;

    for (const page of insertedPages || []) {
      const pageDescription =
        (typeof page.page_description === "string" && page.page_description.trim()) ||
        (page.page_type === "cover"
          ? "Cover page introducing the comic world and main character."
          : page.page_type === "back"
            ? "Back page with a calm closing visual moment."
            : "");

      const panelPrompt = `You are a comic storyboard artist.

Generate panels for ONE comic page.

PAGE
Description: ${pageDescription}
Panels: ${page.panel_count}
Layout: ${page.layout_key}
Language: ${project.text_language}

CHARACTER (CONSISTENCY)

Name: ${character.name}
Look: ${String(characterDesign.description || "")}
Outfit: ${String(characterDesign.costume || "")}
Iconic: ${String(characterDesign.iconic_elements || "")}

STYLE

${String(visualDirection.overall_style || "")}
Colors: ${String(visualDirection.color_palette || "")}

RULES

- Generate exactly ${page.panel_count} panels
- Each panel = ONE clear visual moment
- Panels must progress the scene logically
- Maintain character and environment continuity
- Reading order: left → right, top → bottom
- Keep actions simple and easy to illustrate
- Prefer visual storytelling over dialogue

PANEL FORMAT

Each panel must include:

panel_number (1 → N)

panel_type (story purpose, choose one):
establishing, action, reaction, detail

camera_angle (viewpoint, choose one):
eye_level, low_angle, high_angle, over_the_shoulder

composition:
- describe subject placement and framing (foreground/background, left/right, depth)
- max 1 sentence

action_description:
- max 1 sentence
- clear and concrete

characters_present:
- comma separated
- use ONLY known character names
- no new characters

dialogue_text:
- optional
- MAX 8 words
- MUST BE UPPERCASE

caption_text:
- optional
- MAX 10 words
- MUST BE UPPERCASE

visual_focus:
- main subject of the panel

layout_position:
- position in page layout
- must match layout: ${page.layout_key}
- examples: top_left, top_right, top_full, middle_left, middle_right, bottom_left, bottom_right, bottom_full

CONSTRAINTS

- Avoid complex actions
- Avoid repeating same panel_type more than 2 times in a row
- Keep scenes visually clean

OUTPUT (STRICT JSON)

{
  "panels": [
    {
      "panel_number": 1,
      "panel_type": "",
      "camera_angle": "",
      "composition": "",
      "action_description": "",
      "characters_present": "",
      "dialogue_text": "",
      "caption_text": "",
      "visual_focus": "",
      "layout_position": ""
    }
  ]
}

- Output MUST be valid JSON
- No extra text
- No trailing commas`;

      let generatedPanels: GeneratedPanel[] = [];
      let parsedSuccessfully = false;
      let lastPanelContent = "";

      for (let attempt = 1; attempt <= maxPanelJsonRetries; attempt++) {
        console.log(
          `[Comic Script] Generating panels for page ${page.page_number} (attempt ${attempt}/${maxPanelJsonRetries})...`
        );

        const panelResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 4000,
          messages: [
            {
              role: "user",
              content: panelPrompt,
            },
          ],
        });

        console.log(
          `[Comic Script] OpenAI panel response for page ${page.page_number} (attempt ${attempt}):`,
          panelResponse
        );

        const panelContent = panelResponse.choices[0]?.message?.content;
        if (!panelContent || typeof panelContent !== "string") {
          console.error(
            `[Comic Script] Missing panel content for page ${page.page_number} on attempt ${attempt}`
          );

          if (attempt === maxPanelJsonRetries) {
            return NextResponse.json(
              { error: `No panel content returned for page ${page.page_number}.` },
              { status: 500 }
            );
          }

          continue;
        }

        lastPanelContent = panelContent;
        console.log(
          `[Comic Script] OpenAI panel content for page ${page.page_number} (attempt ${attempt}):`,
          panelContent
        );

        try {
          const parsedPanels = extractJsonFromOpenAiContent(panelContent) as {
            panels?: GeneratedPanel[];
          };

          generatedPanels = Array.isArray(parsedPanels.panels)
            ? parsedPanels.panels
            : [];
          parsedSuccessfully = true;
          break;
        } catch (parsePanelError) {
          console.error(
            `[Comic Script] Failed to parse panels JSON for page ${page.page_number} on attempt ${attempt}:`,
            parsePanelError
          );
          console.error("[Comic Script] Raw panel content:", panelContent);

          if (attempt < maxPanelJsonRetries) {
            console.log(
              `[Comic Script] Retrying page ${page.page_number} due to invalid JSON...`
            );
          }
        }
      }

      if (!parsedSuccessfully) {
        console.error(
          `[Comic Script] Exhausted retries for page ${page.page_number}. Last panel content:`,
          lastPanelContent
        );
        return NextResponse.json(
          {
            error: `Failed to parse panel response for page ${page.page_number} after ${maxPanelJsonRetries} attempts.`,
          },
          { status: 500 }
        );
      }

      if (generatedPanels.length !== page.panel_count) {
        console.error(`[Comic Script] Panel count mismatch on page ${page.page_number}:`, {
          expected: page.panel_count,
          received: generatedPanels.length,
          generatedPanels,
        });
        return NextResponse.json(
          {
            error: `Panel count mismatch on page ${page.page_number}. Expected ${page.panel_count}, got ${generatedPanels.length}.`,
          },
          { status: 500 }
        );
      }

      generatedPanels.forEach((panel, index) => {
        panelRows.push({
          project_id,
          page_id: page.id,
          panel_number: Number(panel.panel_number ?? index + 1),
          panel_type: String(panel.panel_type || "").trim() || null,
          camera_angle: String(panel.camera_angle || "").trim() || null,
          composition: String(panel.composition || "").trim() || null,
          action_description: String(panel.action_description || "").trim() || null,
          characters_present: String(panel.characters_present || "").trim() || null,
          dialogue_text: String(panel.dialogue_text || "").trim() || null,
          layout_position: String(panel.layout_position || "").trim() || null,
          caption_text: String(panel.caption_text || "").trim() || null,
          visual_focus: String(panel.visual_focus || "").trim() || null,
          updated_at: new Date().toISOString(),
        });
      });
    }

    console.log("[Comic Script] Inserting project_panels into database...");
    const { data: insertedPanels, error: insertPanelsError } = await adminClient
      .from("project_panels")
      .insert(panelRows)
      .select("id, page_id, panel_number, panel_type, camera_angle, layout_position");

    if (insertPanelsError) {
      console.error("[Comic Script] Failed to insert project_panels:", insertPanelsError);
      return NextResponse.json(
        { error: "Failed to save project panels to database." },
        { status: 500 }
      );
    }

    console.log("[Comic Script] Inserted project_panels:", insertedPanels);

    return NextResponse.json({
      success: true,
      projectScript,
      projectId: project_id,
      projectPages: insertedPages,
      projectPanels: insertedPanels,
    });
  } catch (error) {
    console.error("[Comic Script] Unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
