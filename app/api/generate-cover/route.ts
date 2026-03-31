import OpenAI from "openai";
import { NextResponse } from "next/server";

type CoverPayload = {
  title?: string;
  heroName?: string;
  heroType?: string;
  readerAge?: string;
  genre?: string;
  visualStyle?: string;
  pictureName?: string;
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in environment." },
        { status: 500 },
      );
    }

    const payload = (await request.json()) as CoverPayload;
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

    const prompt = `Create a comic cover illustration with these details:
Title: ${payload.title || "N/A"}
Hero Name: ${payload.heroName || "N/A"}
Hero Type: ${payload.heroType || "N/A"}
Target Reader Age: ${payload.readerAge || "N/A"}
Genre: ${payload.genre || "N/A"}
Visual Style: ${payload.visualStyle || "N/A"}
Reference filename: ${payload.pictureName || "N/A"}

Style requirements: cinematic composition, clear title area, high contrast, polished comic cover look.`;

    const imageResponse = await client.images.generate({
      model,
      prompt,
      size: "1024x1024",
    });

    const b64 = imageResponse.data?.[0]?.b64_json;

    if (!b64) {
      return NextResponse.json(
        { error: "No image data returned from OpenAI." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      imageDataUrl: `data:image/png;base64,${b64}`,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to generate cover image." },
      { status: 500 },
    );
  }
}
