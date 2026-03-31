import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("style_presets")
      .select("id, style_name")
      .order("style_name", { ascending: true });

    if (error) {
      console.error("Error fetching styles:", error);
      return NextResponse.json(
        { error: "Failed to fetch styles" },
        { status: 500 }
      );
    }

    return NextResponse.json({ styles: data || [] }, { status: 200 });
  } catch (err) {
    console.error("Unexpected error fetching styles:", err);
    return NextResponse.json(
      { error: "Failed to fetch styles" },
      { status: 500 }
    );
  }
}
