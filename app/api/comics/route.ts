import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SaveComicPayload = {
  title?: string;
  heroName?: string;
  heroType?: string;
  readerAge?: string;
  genre?: string;
  visualStyle?: string;
  pictureName?: string;
  generatedConcept?: string;
  coverImageDataUrl?: string;
};

function normalizeText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeAge(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SaveComicPayload;
    const generatedConcept = normalizeText(payload.generatedConcept);

    if (!generatedConcept) {
      return NextResponse.json(
        { error: "generatedConcept is required." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("comics")
      .insert({
        title: normalizeText(payload.title),
        hero_name: normalizeText(payload.heroName),
        hero_type: normalizeText(payload.heroType),
        reader_age: normalizeAge(payload.readerAge),
        genre: normalizeText(payload.genre),
        visual_style: normalizeText(payload.visualStyle),
        picture_name: normalizeText(payload.pictureName),
        generated_concept: generatedConcept,
        cover_image_data_url: normalizeText(payload.coverImageDataUrl),
      })
      .select("id, created_at")
      .single();

    if (error) {
      console.error(error);

      return NextResponse.json(
        { error: "Supabase insert failed." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: data.id,
      createdAt: data.created_at,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to save comic to Supabase." },
      { status: 500 },
    );
  }
}