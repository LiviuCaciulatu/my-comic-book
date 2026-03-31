import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const serverClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("character_identities")
    .select("id, name, reference_face_image_path")
    .eq("client_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load characters.", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    characters: (data ?? []).map((character) => ({
      id: character.id,
      name: character.name,
      faceImageUrl: character.reference_face_image_path,
    })),
  });
}