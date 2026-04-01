import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const project_id = searchParams.get("project_id");

  if (!project_id) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Verify project belongs to this user via client_id
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .eq("client_id", user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: pages, error: pagesError } = await admin
    .from("project_pages")
    .select("page_number, page_type, image_url")
    .eq("project_id", project_id)
    .order("page_number", { ascending: true });

  if (pagesError) {
    return NextResponse.json({ error: pagesError.message }, { status: 500 });
  }

  return NextResponse.json({ pages: pages ?? [] });
}
