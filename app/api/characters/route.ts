import { NextResponse } from "next/server";
import OpenAI from "openai";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CHARACTER_IMAGES_BUCKET =
  process.env.SUPABASE_CHARACTER_IMAGES_BUCKET ?? "character-images";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5";
const CHARACTER_CREATION_TOKEN_COST = 2;

function getTrimmedValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function normalizeListValue(raw: string): string | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const cleaned = parsed
        .map((item) => String(item).trim())
        .filter(Boolean)
        .join(", ");
      return cleaned || null;
    }
  } catch {

  }

  return raw;
}

function toNullable(raw: string): string | null {
  return raw || null;
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

  const formData = await req.formData();
  const name = getTrimmedValue(formData, "name");
  const ageRaw = getTrimmedValue(formData, "age");
  const age = Number(ageRaw);

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  if (!Number.isInteger(age) || age < 0) {
    return NextResponse.json(
      { error: "Age must be a valid non-negative integer." },
      { status: 400 },
    );
  }

  const personalityTraits = normalizeListValue(
    getTrimmedValue(formData, "personality_traits"),
  );
  const distinctiveFeatures = normalizeListValue(
    getTrimmedValue(formData, "distinctive_features"),
  );

  const ageAppearance = toNullable(getTrimmedValue(formData, "age_appearance"));
  const gender = toNullable(getTrimmedValue(formData, "gender"));
  const baseDescription = toNullable(getTrimmedValue(formData, "base_description"));
  const hairColor = toNullable(getTrimmedValue(formData, "hair_color"));
  const eyeColor = toNullable(getTrimmedValue(formData, "eye_color"));
  const skinTone = toNullable(getTrimmedValue(formData, "skin_tone"));
  const hairLength = toNullable(getTrimmedValue(formData, "hair_length"));
  const hairStyle = toNullable(getTrimmedValue(formData, "hair_style"));
  const faceShape = toNullable(getTrimmedValue(formData, "face_shape"));
  const outfitPreferences = toNullable(getTrimmedValue(formData, "outfit_preferences"));

  const imageEntry = formData.get("image");
  const imageFile = imageEntry instanceof File && imageEntry.size > 0 ? imageEntry : null;

  const admin = createSupabaseAdminClient();

  let imagePath: string | null = null;
  let imageUrl: string | null = null;
  let faceImagePath: string | null = null;
  let faceImageUrl: string | null = null;

  const cleanupUploadedAssets = async () => {
    const pathsToRemove = [imagePath, faceImagePath].filter(
      (path): path is string => Boolean(path),
    );

    if (pathsToRemove.length > 0) {
      await admin.storage.from(CHARACTER_IMAGES_BUCKET).remove(pathsToRemove);
    }
  };

  if (imageFile) {
    const safeFileName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    imagePath = `${user.id}/characters/${Date.now()}-${crypto.randomUUID()}-${safeFileName}`;

    const { error: uploadError } = await admin.storage
      .from(CHARACTER_IMAGES_BUCKET)
      .upload(imagePath, imageFile, {
        contentType: imageFile.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        {
          error: `Failed to upload image to bucket \"${CHARACTER_IMAGES_BUCKET}\".`,
          details: uploadError.message,
        },
        { status: 500 },
      );
    }

    const { data: storedImageUrlData, error: storedImageUrlError } = await admin.storage
      .from(CHARACTER_IMAGES_BUCKET)
      .createSignedUrl(imagePath, 60 * 60 * 24 * 7);

    if (storedImageUrlError || !storedImageUrlData?.signedUrl) {
      return NextResponse.json(
        {
          error: "Failed to create stored URL for uploaded image.",
          details: storedImageUrlError?.message ?? "Missing signed URL.",
        },
        { status: 500 },
      );
    }

    imageUrl = storedImageUrlData.signedUrl;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in environment." },
        { status: 500 },
      );
    }

    const { data: signedImageData, error: signedImageError } = await admin.storage
      .from(CHARACTER_IMAGES_BUCKET)
      .createSignedUrl(imagePath, 60 * 60);

    if (signedImageError || !signedImageData?.signedUrl) {
      return NextResponse.json(
        {
          error: "Failed to create signed URL for reference image.",
          details: signedImageError?.message ?? "Missing signed URL.",
        },
        { status: 500 },
      );
    }

    const openai = new OpenAI({ apiKey });
    const prompt = `Generate a clean, neutral, front-facing reference portrait of a character.

  INPUT SOURCES:
  1. Reference Image: Use the uploaded image as the PRIMARY visual reference.
  2. Character Attributes: Use the following to refine or override unclear details:
  - Hair: ${hairColor ?? "not specified"}, ${hairLength ?? "not specified"}, ${hairStyle ?? "not specified"}
  - Eyes: ${eyeColor ?? "not specified"}
  - Skin: ${skinTone ?? "not specified"}
  - Distinctive Features: ${distinctiveFeatures ?? "none"}
  - Face Shape: ${faceShape ?? "default"}
  - Age Appearance: ${ageAppearance ?? String(age)}

  PRIORITY RULES:
  - Preserve identity and core facial structure from the reference image.
  - If attributes conflict with the image, prefer the attributes ONLY when the feature is unclear or ambiguous in the image.
  - Do NOT significantly alter identity (no different person).

  REQUIREMENTS:
  - Front-facing portrait (head and shoulders visible).
  - Neutral expression (no strong emotion).
  - Minimal background (plain or transparent).
  - Clean, simplified design for reuse across different art styles.
  - Maintain accurate proportions and clear facial features.
  - Preserve key traits: hair color, eye color, skin tone, and distinctive features.
  - No text, logos, or extra elements.

  OUTPUT:
  - Simple, consistent reference portrait suitable for reuse.
  - Low resolution is acceptable (optimized for cost).`;

    // Download the uploaded image so we can pass it as a File to images.edit
    const imgFetch = await fetch(signedImageData.signedUrl);
    if (!imgFetch.ok) {
      return NextResponse.json(
        { error: "Failed to download reference image for OpenAI processing." },
        { status: 500 },
      );
    }
    const imgBuffer = Buffer.from(await imgFetch.arrayBuffer());
    const imgFile = new File([imgBuffer], "reference.png", { type: "image/png" });

    const imageResponse = await openai.images.edit({
      model: OPENAI_IMAGE_MODEL,
      image: imgFile,
      prompt,
      size: "1024x1024",
    });

    const generatedB64 = imageResponse.data?.[0]?.b64_json;
    if (!generatedB64) {
      return NextResponse.json(
        { error: "No generated face image returned from OpenAI." },
        { status: 502 },
      );
    }

    const generatedBuffer = Buffer.from(generatedB64, "base64");
    faceImagePath = `${user.id}/characters/faces/${Date.now()}-${crypto.randomUUID()}.png`;

    const { error: uploadFaceError } = await admin.storage
      .from(CHARACTER_IMAGES_BUCKET)
      .upload(faceImagePath, generatedBuffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadFaceError) {
      return NextResponse.json(
        {
          error: `Failed to upload generated face image to bucket \"${CHARACTER_IMAGES_BUCKET}\".`,
          details: uploadFaceError.message,
        },
        { status: 500 },
      );
    }

    const { data: storedFaceUrlData, error: storedFaceUrlError } = await admin.storage
      .from(CHARACTER_IMAGES_BUCKET)
      .createSignedUrl(faceImagePath, 60 * 60 * 24 * 7);

    if (storedFaceUrlError || !storedFaceUrlData?.signedUrl) {
      return NextResponse.json(
        {
          error: "Failed to create stored URL for generated face image.",
          details: storedFaceUrlError?.message ?? "Missing signed URL.",
        },
        { status: 500 },
      );
    }

    faceImageUrl = storedFaceUrlData.signedUrl;
  }

  const row = {
    client_id: user.id,
    name,
    age,
    age_appearance: ageAppearance,
    gender,
    personality_traits: personalityTraits,
    base_description: baseDescription,
    reference_image_path: imageUrl,
    reference_face_image_path: faceImageUrl,
    hair_color: hairColor,
    eye_color: eyeColor,
    skin_tone: skinTone,
    hair_length: hairLength,
    hair_style: hairStyle,
    face_shape: faceShape,
    distinctive_features: distinctiveFeatures,
    outfit_preferences: outfitPreferences,
    updated_at: new Date().toISOString(),
  };

  const { data, error: insertError } = await admin
    .from("character_identities")
    .insert(row)
    .select("id")
    .single();

  if (insertError) {
    await cleanupUploadedAssets();

    return NextResponse.json(
      {
        error: "Failed to save character.",
        details: insertError.message,
      },
      { status: 500 },
    );
  }

  const { data: wallet, error: walletError } = await admin
    .from("token_wallet")
    .select("balance")
    .eq("client_id", user.id)
    .single();

  if (walletError || !wallet) {
    await admin.from("character_identities").delete().eq("id", data.id);
    await cleanupUploadedAssets();

    return NextResponse.json(
      {
        error: "Wallet not found for this user.",
        details: walletError?.message,
      },
      { status: 500 },
    );
  }

  if (wallet.balance < CHARACTER_CREATION_TOKEN_COST) {
    await admin.from("character_identities").delete().eq("id", data.id);
    await cleanupUploadedAssets();

    return NextResponse.json(
      {
        error: `Not enough tokens. You need ${CHARACTER_CREATION_TOKEN_COST} tokens to create a character.`,
      },
      { status: 400 },
    );
  }

  const newBalance = wallet.balance - CHARACTER_CREATION_TOKEN_COST;
  const { error: walletUpdateError } = await admin
    .from("token_wallet")
    .update({
      balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", user.id);

  if (walletUpdateError) {
    await admin.from("character_identities").delete().eq("id", data.id);
    await cleanupUploadedAssets();

    return NextResponse.json(
      {
        error: "Failed to deduct tokens.",
        details: walletUpdateError.message,
      },
      { status: 500 },
    );
  }

  const { error: txError } = await admin.from("token_transactions").insert({
    client_id: user.id,
    amount: -CHARACTER_CREATION_TOKEN_COST,
    type: "generation_cost",
    reference_type: "character_identity",
    reference_id: data.id,
    description: `Character creation cost (${CHARACTER_CREATION_TOKEN_COST} tokens).`,
  });

  if (txError) {
    // Revert wallet deduction and created character if the ledger write fails.
    await admin
      .from("token_wallet")
      .update({ balance: wallet.balance, updated_at: new Date().toISOString() })
      .eq("client_id", user.id);
    await admin.from("character_identities").delete().eq("id", data.id);
    await cleanupUploadedAssets();

    return NextResponse.json(
      {
        error: "Failed to record token transaction.",
        details: txError.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    id: data.id,
    tokensDeducted: CHARACTER_CREATION_TOKEN_COST,
    remainingBalance: newBalance,
    imagePath,
    imageUrl,
    faceImagePath,
    faceImageUrl,
  });
}

export async function DELETE(req: Request) {
  const serverClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing character id." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: character, error: fetchError } = await admin
    .from("character_identities")
    .select("id, client_id, reference_image_path, reference_face_image_path")
    .eq("id", id)
    .single();

  if (fetchError || !character) {
    return NextResponse.json({ error: "Character not found." }, { status: 404 });
  }

  if (character.client_id !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Extract storage paths from signed URLs
  function extractStoragePath(signedUrl: string | null, bucket: string): string | null {
    if (!signedUrl) return null;
    try {
      const url = new URL(signedUrl);
      const prefix = `/storage/v1/object/sign/${bucket}/`;
      if (url.pathname.startsWith(prefix)) return url.pathname.slice(prefix.length);
    } catch {
      // ignore
    }
    return null;
  }

  const storagePaths = [
    extractStoragePath(character.reference_image_path, CHARACTER_IMAGES_BUCKET),
    extractStoragePath(character.reference_face_image_path, CHARACTER_IMAGES_BUCKET),
  ].filter((p): p is string => Boolean(p));

  if (storagePaths.length > 0) {
    await admin.storage.from(CHARACTER_IMAGES_BUCKET).remove(storagePaths);
  }

  const { error: deleteError } = await admin
    .from("character_identities")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
