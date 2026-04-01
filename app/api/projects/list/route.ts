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

  // Fetch all projects for this user
  const { data: projects, error: projectsError } = await admin
    .from("projects")
    .select("id, title, genre, age_group, created_at")
    .eq("client_id", user.id)
    .order("created_at", { ascending: false });

  if (projectsError) {
    console.error("[Projects List] Error fetching projects:", projectsError);
    return NextResponse.json({ error: "Failed to fetch projects." }, { status: 500 });
  }

  if (!projects || projects.length === 0) {
    return NextResponse.json({ projects: [] });
  }

  // Fetch cover page image_url for each project
  const projectIds = projects.map((p) => p.id);

  const { data: coverPages, error: coverError } = await admin
    .from("project_pages")
    .select("project_id, image_url")
    .in("project_id", projectIds)
    .eq("page_type", "cover");

  if (coverError) {
    console.error("[Projects List] Error fetching cover pages:", coverError);
  }

  const coverMap = new Map<string, string | null>();
  for (const page of coverPages ?? []) {
    coverMap.set(page.project_id, page.image_url ?? null);
  }

  const result = projects.map((project) => ({
    id: project.id,
    title: project.title,
    genre: project.genre,
    age_group: project.age_group,
    created_at: project.created_at,
    cover_image_url: coverMap.get(project.id) ?? null,
  }));

  return NextResponse.json({ projects: result });
}
