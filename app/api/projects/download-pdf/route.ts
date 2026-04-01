import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PDFDocument } from "pdf-lib";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Verify ownership
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id, title, client_id")
    .eq("id", project_id)
    .eq("client_id", user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Fetch all pages with image URLs ordered by page_number
  const { data: pages, error: pagesError } = await admin
    .from("project_pages")
    .select("page_number, page_type, image_url")
    .eq("project_id", project_id)
    .order("page_number", { ascending: true });

  if (pagesError || !pages || pages.length === 0) {
    return NextResponse.json({ error: "No pages found" }, { status: 404 });
  }

  // Build PDF
  const pdfDoc = await PDFDocument.create();

  for (const page of pages) {
    if (!page.image_url) continue;

    let imageBytes: ArrayBuffer;
    try {
      const imgRes = await fetch(page.image_url);
      if (!imgRes.ok) {
        console.warn(`[Download PDF] Failed to fetch image for page ${page.page_number}: ${imgRes.status}`);
        continue;
      }
      imageBytes = await imgRes.arrayBuffer();
    } catch (err) {
      console.warn(`[Download PDF] Error fetching image for page ${page.page_number}:`, err);
      continue;
    }

    // Detect format by checking magic bytes
    const header = new Uint8Array(imageBytes).slice(0, 4);
    const isWebp =
      header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46;
    const isPng =
      header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;

    let embeddedImage;
    try {
      if (isPng) {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
      } else if (isWebp) {
        // pdf-lib doesn't support webp natively — skip and warn
        console.warn(`[Download PDF] WebP not supported by pdf-lib for page ${page.page_number}, skipping`);
        continue;
      } else {
        // Assume JPEG
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
      }
    } catch (err) {
      console.warn(`[Download PDF] Failed to embed image for page ${page.page_number}:`, err);
      continue;
    }

    // A4 portrait in points: 595 x 842
    // Use image's natural aspect ratio to fill the page
    const { width: imgW, height: imgH } = embeddedImage;
    const pageWidth = 595;
    const pageHeight = Math.round(pageWidth * (imgH / imgW));

    const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);
    pdfPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  const safeTitle = (project.title as string)
    .replace(/[^a-z0-9]/gi, "-")
    .toLowerCase()
    .slice(0, 60);

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeTitle}.pdf"`,
      "Content-Length": pdfBuffer.byteLength.toString(),
    },
  });
}
