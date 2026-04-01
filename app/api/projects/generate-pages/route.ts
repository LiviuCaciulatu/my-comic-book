import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PAGE_IMAGES_BUCKET =
  process.env.SUPABASE_PAGE_IMAGES_BUCKET ?? "page-images";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5";

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildFrontCoverPrompt(
  project: Record<string, unknown>,
  character: Record<string, unknown>,
  visualDirection: Record<string, unknown>
): string {
  return `
Generate a full front cover illustration for a CHILDREN'S COMIC BOOK.

PROJECT

Title: "${project.title}"
Genre: ${project.genre}
Style Key: ${project.style_key}
Target Age Group: ${project.age_group}

CHARACTER

Main Character: ${character.name}, ${character.age} years old
Appearance: ${character.hair_color}, ${character.hair_length}, ${character.hair_style}, eyes: ${character.eye_color}, skin: ${character.skin_tone}, face shape: ${character.face_shape || "default"}, distinctive features: ${character.distinctive_features || "none"}
Outfit: ${character.outfit_preferences || "none"}

REFERENCE IMAGE (CRITICAL)

- An image of the main character's face is attached
- You MUST use it to preserve identity, facial features, and likeness
- Do NOT redesign or reinterpret the face
- Match the character consistently in style

VISUAL DIRECTION

Style: ${visualDirection.overall_style}
Color Palette: ${visualDirection.color_palette}

COMPOSITION

- The main character MUST be the clear focal point
- Use a dynamic pose (hero pose, action, or expressive moment)
- Background should support the story but not distract
- Visual style, complexity, and readability must match the target age group

TITLE RENDERING (CRITICAL)

- Place the title at the TOP of the cover
- The title MUST be LARGE, CLEAR, and EASY TO READ
- The title MUST be in ALL UPPERCASE
- Use simple, bold comic-style lettering (no complex fonts)

TEXT RULES:
- High contrast between text and background
- If needed, use a solid or semi-solid background behind the text
- Do NOT distort, warp, or curve the text excessively
- Ensure the full title is readable and correctly spelled

VISUAL QUALITY

- Bright, vibrant, kid-friendly comic style
- Clean linework
- Strong silhouette and composition
- Clear readability even at small (thumbnail) size

CONSTRAINTS

- Do NOT add extra text besides the title
- Do NOT clutter the top area behind the title
- Do NOT change character design

OUTPUT

Return a single front cover illustration with the title rendered on the image.
`.trim();
}

function buildBackCoverPrompt(
  project: Record<string, unknown>,
  character: Record<string, unknown>,
  visualDirection: Record<string, unknown>
): string {
  return `
Generate a full back cover illustration for a children's comic book.

PROJECT

Title: ${project.title}
Genre: ${project.genre}
Style Key: ${project.style_key}
Target Age Group: ${project.age_group}

CHARACTER (OPTIONAL)

Main Character: ${character.name}, ${character.age}
Appearance: ${character.hair_color}, ${character.hair_length}, ${character.hair_style}, eyes: ${character.eye_color}, skin: ${character.skin_tone}, features: ${character.distinctive_features || "none"}
Outfit: ${character.outfit_preferences || "none"}

VISUAL DIRECTION

Style: ${visualDirection.overall_style}
Color Palette: ${visualDirection.color_palette}

CREATIVE DIRECTION

The back cover should feel like a natural visual ending to the story.

Choose ONE of the following approaches:
- A calm aftermath scene after the story's resolution
- A peaceful or atmospheric environment from the story world
- A subtle teaser hinting at future adventures

COMPOSITION

- Keep the composition clean and balanced
- Avoid overly dynamic or chaotic scenes
- Do NOT replicate the front cover composition
- Character (if present) should NOT dominate the entire image
- Focus on mood, environment, or emotion

VISUAL STYLE

- Maintain consistency with the front cover and interior pages
- Use softer or more relaxed lighting compared to the front cover
- Keep a strong but simple color composition
- Ensure readability and clarity

CONSTRAINTS

- Do NOT include any text
- Do NOT create panels (single illustration only)
- Do NOT overcrowd the image
- Do NOT turn this into a second front cover

OUTPUT

Return a single back cover illustration.
`.trim();
}

function buildStoryPagePrompt(
  project: Record<string, unknown>,
  page: Record<string, unknown>,
  panels: Array<Record<string, unknown>>,
  character: Record<string, unknown>,
  visualDirection: Record<string, unknown>
): string {
  const panelLines = panels
    .map(
      (panel) => `
Panel ${panel.panel_number}:
- Type: ${panel.panel_type}
- Camera Angle: ${panel.camera_angle}
- Composition / Action: ${panel.action_description}
- Characters Present: ${panel.characters_present}
- Dialogue Text: ${panel.dialogue_text || "none"}
- Caption Text: ${panel.caption_text || "none"}
- Visual Focus: ${panel.visual_focus || "general"}`
    )
    .join("\n");

  return `
Generate a full-page illustration for a CHILDREN'S COMIC BOOK (middle-grade) page.

Project Information:
- Title: ${project.title}
- Issue Number: ${project.issue_number || "N/A"}
- Series Name: ${project.series_name || "N/A"}
- Genre: ${project.genre}
- Style Key: ${project.style_key}
- Project Type: ${project.project_type}
- Target Age Group: ${project.age_group}
- Short Idea: "${project.short_idea}"
- Synopsis: "${project.synopsis}"

Page Information:
- Page Number: ${page.page_number}
- Story Step: ${page.story_step}
- Story Step Title: ${page.story_step_title}
- Story Beat Title: ${page.story_beat_title}
- Page Description: ${page.page_description}
- Panel Count: ${page.panel_count}
- Layout Key: ${page.layout_key}
- Is Splash Page: ${page.is_splash_page ? "Yes" : "No"}

Panels (from project_panels database):
${panelLines}

Character Design & Visual Direction:
- Main Character: ${character.name}, ${character.age} years old
- Personality: ${character.personality_traits || "unspecified"}
- Appearance: ${character.hair_color}, ${character.hair_length}, ${character.hair_style}, eyes: ${character.eye_color}, skin: ${character.skin_tone}, face shape: ${character.face_shape || "default"}, distinctive features: ${character.distinctive_features || "none"}
- Outfit Preferences: ${character.outfit_preferences || "none"}
- Reference Face Image: attached
- Visual Direction / Art Style: ${visualDirection.overall_style}
- Color Palette: ${visualDirection.color_palette}
- Notes: ${(visualDirection.notes as string) || "none"}

Requirements:
- Generate all panels for this page in a single cohesive illustration
- Follow the panel descriptions exactly (actions, poses, dialogue, visual focus)
- Maintain consistency of character design and overall visual direction
- Bright, clear, kid-friendly comic style
- Use layout hints from layout_key (grid, splash, horizontal)
- Avoid adding text outside of speech bubbles or captions
- Keep the background consistent with visual direction
- Ensure characters are recognizable and consistent across pages
- Resolution: suitable for print or digital comic panels

Return: a single image that depicts the full page with all panels integrated.
`.trim();
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const serverClient = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { project_id } = (await req.json()) as { project_id?: string };

    if (!project_id) {
      return NextResponse.json(
        { error: "Missing project_id" },
        { status: 400 }
      );
    }

    const adminClient = createSupabaseAdminClient();

    // Fetch project
    console.log("[Generate Pages] Fetching project:", project_id);
    const { data: project, error: projectError } = await adminClient
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .eq("client_id", user.id)
      .single();

    if (projectError || !project) {
      console.error("[Generate Pages] Project not found:", projectError);
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    console.log("[Generate Pages] Project fetched:", project);

    // Fetch character
    console.log(
      "[Generate Pages] Fetching character:",
      project.main_character_id
    );
    const { data: character, error: characterError } = await adminClient
      .from("character_identities")
      .select("*")
      .eq("id", project.main_character_id)
      .single();

    if (characterError || !character) {
      console.error("[Generate Pages] Character not found:", characterError);
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 }
      );
    }

    console.log("[Generate Pages] Character fetched:", character);

    // Fetch all pages for the project
    const { data: pages, error: pagesError } = await adminClient
      .from("project_pages")
      .select("*")
      .eq("project_id", project_id)
      .order("page_number", { ascending: true });

    if (pagesError || !pages || pages.length === 0) {
      console.error("[Generate Pages] Pages not found:", pagesError);
      return NextResponse.json(
        { error: "No project pages found. Run generate-script first." },
        { status: 404 }
      );
    }

    console.log("[Generate Pages] Fetched", pages.length, "pages");

    const visualDirection =
      project.visual_direction &&
      typeof project.visual_direction === "object"
        ? (project.visual_direction as Record<string, unknown>)
        : {};

    // Fetch and cache the reference face image once for all pages
    let faceImageFile: File | null = null;

    if (character.reference_face_image_path) {
      console.log(
        "[Generate Pages] Fetching reference face image from:",
        character.reference_face_image_path
      );

      const faceResponse = await fetch(
        character.reference_face_image_path as string
      );

      if (!faceResponse.ok) {
        console.error(
          "[Generate Pages] Failed to fetch reference face image:",
          faceResponse.status,
          faceResponse.statusText
        );
        return NextResponse.json(
          { error: "Failed to fetch character reference face image." },
          { status: 500 }
        );
      }

      const faceBuffer = Buffer.from(await faceResponse.arrayBuffer());
      faceImageFile = new File([faceBuffer], "reference_face.png", {
        type: "image/png",
      });

      console.log("[Generate Pages] Reference face image ready.");
    } else {
      console.warn(
        "[Generate Pages] No reference_face_image_path for character. Generating without face reference."
      );
    }

    const generatedPageResults: Array<{
      page_id: string;
      page_number: number;
      page_type: string;
      image_url: string;
    }> = [];

    for (const page of pages) {
      console.log(
        `[Generate Pages] Processing page ${page.page_number} (${page.page_type})...`
      );

      // Fetch panels for this page
      const { data: panels, error: panelsError } = await adminClient
        .from("project_panels")
        .select("*")
        .eq("page_id", page.id)
        .order("panel_number", { ascending: true });

      if (panelsError) {
        console.error(
          `[Generate Pages] Failed to fetch panels for page ${page.page_number}:`,
          panelsError
        );
        return NextResponse.json(
          {
            error: `Failed to fetch panels for page ${page.page_number}: ${panelsError.message}`,
          },
          { status: 500 }
        );
      }

      console.log(
        `[Generate Pages] Page ${page.page_number} has ${panels?.length ?? 0} panels.`
      );

      // Build prompt and parameters based on page_type
      let prompt: string;
      let size: "1024x1536";
      let quality: "high" | "medium";

      const pageRecord = page as Record<string, unknown>;
      const characterRecord = character as Record<string, unknown>;

      if (page.page_type === "cover") {
        prompt = buildFrontCoverPrompt(project, characterRecord, visualDirection);
        size = "1024x1536";
        quality = "high";
      } else if (page.page_type === "back") {
        prompt = buildBackCoverPrompt(project, characterRecord, visualDirection);
        size = "1024x1536";
        quality = "medium";
      } else {
        prompt = buildStoryPagePrompt(
          project,
          pageRecord,
          (panels ?? []) as Array<Record<string, unknown>>,
          characterRecord,
          visualDirection
        );
        size = "1024x1536";
        quality = "medium";
      }

      console.log(
        `[Generate Pages] Prompt for page ${page.page_number}:\n`,
        prompt
      );

      console.log(
        `[Generate Pages] Calling OpenAI for page ${page.page_number}...`
      );

      // Use images.edit when a reference face is available, images.generate otherwise
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const imageResult = faceImageFile
        ? await (openai.images.edit as any)({
            model: OPENAI_IMAGE_MODEL,
            image: faceImageFile,
            prompt,
            size,
            quality,
          })
        : await (openai.images.generate as any)({
            model: OPENAI_IMAGE_MODEL,
            prompt,
            size,
            quality,
          });

      console.log(
        `[Generate Pages] OpenAI response for page ${page.page_number}:`,
        imageResult
      );

      const b64 = imageResult.data?.[0]?.b64_json;

      if (!b64) {
        console.error(
          `[Generate Pages] No b64_json returned for page ${page.page_number}:`,
          imageResult
        );
        return NextResponse.json(
          {
            error: `No image data returned from OpenAI for page ${page.page_number}.`,
          },
          { status: 502 }
        );
      }

      // Upload image to Supabase storage
      const imageBuffer = Buffer.from(b64 as string, "base64");
      const imagePath = `${user.id}/projects/${project_id}/pages/${page.id}-${Date.now()}.png`;

      console.log(
        `[Generate Pages] Uploading page ${page.page_number} image to:`,
        imagePath
      );

      const { error: uploadError } = await adminClient.storage
        .from(PAGE_IMAGES_BUCKET)
        .upload(imagePath, imageBuffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) {
        console.error(
          `[Generate Pages] Upload failed for page ${page.page_number}:`,
          uploadError
        );
        return NextResponse.json(
          {
            error: `Failed to upload image for page ${page.page_number}: ${uploadError.message}`,
          },
          { status: 500 }
        );
      }

      // Create a signed URL valid for 7 days
      const { data: signedUrlData, error: signedUrlError } =
        await adminClient.storage
          .from(PAGE_IMAGES_BUCKET)
          .createSignedUrl(imagePath, 60 * 60 * 24 * 7);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error(
          `[Generate Pages] Signed URL failed for page ${page.page_number}:`,
          signedUrlError
        );
        return NextResponse.json(
          {
            error: `Failed to create signed URL for page ${page.page_number}.`,
          },
          { status: 500 }
        );
      }

      const imageUrl = signedUrlData.signedUrl;

      // Persist image_url back to project_pages
      const { error: updateError } = await adminClient
        .from("project_pages")
        .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
        .eq("id", page.id);

      if (updateError) {
        console.error(
          `[Generate Pages] Failed to update project_pages for page ${page.page_number}:`,
          updateError
        );
        return NextResponse.json(
          {
            error: `Failed to save image URL for page ${page.page_number}: ${updateError.message}`,
          },
          { status: 500 }
        );
      }

      generatedPageResults.push({
        page_id: String(page.id),
        page_number: Number(page.page_number),
        page_type: String(page.page_type),
        image_url: imageUrl,
      });

      console.log(
        `[Generate Pages] Page ${page.page_number} complete — image saved.`
      );
    }

    console.log(
      "[Generate Pages] All pages generated successfully:",
      generatedPageResults
    );

    // -----------------------------------------------------------------------
    // Token deduction — 20 tokens per comic book generation
    // -----------------------------------------------------------------------
    const COMIC_GENERATION_TOKEN_COST = 20;

    const { data: wallet, error: walletError } = await adminClient
      .from("token_wallet")
      .select("balance")
      .eq("client_id", user.id)
      .single();

    if (walletError || !wallet) {
      console.error("[Generate Pages] Wallet not found:", walletError);
      return NextResponse.json(
        { error: "Wallet not found. Could not deduct tokens." },
        { status: 500 }
      );
    }

    if (wallet.balance < COMIC_GENERATION_TOKEN_COST) {
      return NextResponse.json(
        {
          error: `Not enough tokens. You need ${COMIC_GENERATION_TOKEN_COST} tokens to generate a comic book.`,
        },
        { status: 400 }
      );
    }

    const newBalance = wallet.balance - COMIC_GENERATION_TOKEN_COST;

    const { error: walletUpdateError } = await adminClient
      .from("token_wallet")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("client_id", user.id);

    if (walletUpdateError) {
      console.error("[Generate Pages] Wallet update failed:", walletUpdateError);
      return NextResponse.json(
        { error: "Failed to deduct tokens.", details: walletUpdateError.message },
        { status: 500 }
      );
    }

    const { error: txError } = await adminClient
      .from("token_transactions")
      .insert({
        client_id: user.id,
        amount: -COMIC_GENERATION_TOKEN_COST,
        type: "generation_cost",
        reference_type: "project",
        reference_id: project_id,
        description: `Comic book generation cost (${COMIC_GENERATION_TOKEN_COST} tokens).`,
      });

    if (txError) {
      // Revert wallet deduction if ledger write fails
      await adminClient
        .from("token_wallet")
        .update({ balance: wallet.balance, updated_at: new Date().toISOString() })
        .eq("client_id", user.id);

      console.error("[Generate Pages] Token transaction insert failed:", txError);
      return NextResponse.json(
        { error: "Failed to record token transaction.", details: txError.message },
        { status: 500 }
      );
    }

    console.log(
      `[Generate Pages] Deducted ${COMIC_GENERATION_TOKEN_COST} tokens. New balance: ${newBalance}`
    );

    return NextResponse.json({
      success: true,
      project_id,
      generated_pages: generatedPageResults,
      tokensDeducted: COMIC_GENERATION_TOKEN_COST,
      remainingBalance: newBalance,
    });
  } catch (error) {
    console.error("[Generate Pages] Unexpected error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
