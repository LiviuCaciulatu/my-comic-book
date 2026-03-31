import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CreateProjectPayload = {
  title?: string;
  issue_number?: string | number;
  series_name?: string;
  project_type?: string;
  age_group?: string;
  genre?: string;
  style_key?: string;
  short_idea?: string;
  synopsis?: string;
  main_character_id?: string;
  main_character_role?: string;
  text_language?: string;
  page_count?: string | number;
};

function toNullable(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value || null;
}

function parseOptionalInt(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!text) {
    return null;
  }

  const value = Number(text);
  if (!Number.isInteger(value)) {
    return Number.NaN;
  }

  return value;
}

export async function POST(req: Request) {
  const serverClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: CreateProjectPayload;
  try {
    payload = (await req.json()) as CreateProjectPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = String(payload.title ?? "").trim();
  const shortIdea = String(payload.short_idea ?? "").trim();
  const mainCharacterId = String(payload.main_character_id ?? "").trim();
  const textLanguage = String(payload.text_language ?? "en").trim() || "en";
  const projectType = String(payload.project_type ?? "comic").trim() || "comic";
  const pageCount = Number(payload.page_count);
  const issueNumber = parseOptionalInt(payload.issue_number);

  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  if (!shortIdea) {
    return NextResponse.json({ error: "Short idea is required." }, { status: 400 });
  }

  if (!mainCharacterId) {
    return NextResponse.json(
      { error: "Main character is required." },
      { status: 400 },
    );
  }

  if (projectType !== "comic" && projectType !== "children_book") {
    return NextResponse.json({ error: "Invalid project type." }, { status: 400 });
  }

  if (![10, 20, 40].includes(pageCount)) {
    return NextResponse.json(
      { error: "Page count must be 10, 20, or 40." },
      { status: 400 },
    );
  }

  if (issueNumber !== null && Number.isNaN(issueNumber)) {
    return NextResponse.json(
      { error: "Issue number must be an integer if provided." },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();

  const { data: character, error: characterError } = await admin
    .from("character_identities")
    .select("id")
    .eq("id", mainCharacterId)
    .eq("client_id", user.id)
    .eq("is_active", true)
    .single();

  if (characterError || !character) {
    return NextResponse.json(
      { error: "Selected character was not found for this user." },
      { status: 400 },
    );
  }

  const row = {
    client_id: user.id,
    title,
    issue_number: issueNumber,
    series_name: toNullable(payload.series_name),
    project_type: projectType,
    age_group: toNullable(payload.age_group),
    genre: toNullable(payload.genre),
    style_key: toNullable(payload.style_key),
    short_idea: shortIdea,
    synopsis: toNullable(payload.synopsis),
    main_character_id: mainCharacterId,
    main_character_role: toNullable(payload.main_character_role),
    text_language: textLanguage,
    page_count: pageCount,
    updated_at: new Date().toISOString(),
  };

  console.log("📋 Inserting project into database:", row);

  const { data, error } = await admin
    .from("projects")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("❌ Database insert error:", error);
    return NextResponse.json(
      {
        error: "Failed to create project.",
        details: error.message,
      },
      { status: 500 },
    );
  }

  console.log("✅ Project successfully inserted with ID:", data.id);
  return NextResponse.json({ success: true, id: data.id });
}