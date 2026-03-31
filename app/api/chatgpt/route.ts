import OpenAI from "openai";
import { NextResponse } from "next/server";

type ComicPayload = {
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

    const payload = (await request.json()) as ComicPayload;

    const client = new OpenAI({ apiKey });

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const prompt = `You are a creative comic assistant.
Generate a short concept for a comic based on these inputs:
- Title: ${payload.title || "N/A"}
- Hero Name: ${payload.heroName || "N/A"}
- Hero Type: ${payload.heroType || "N/A"}
- Reader Age: ${payload.readerAge || "N/A"}
- Genre: ${payload.genre || "N/A"}
- Visual Style: ${payload.visualStyle || "N/A"}
- Uploaded picture filename: ${payload.pictureName || "N/A"}

Return:
1) One-sentence hook
2) Three bullet plot beats
3) A short cover-description paragraph`;

    const response = await client.responses.create({
      model,
      input: prompt,
    });

    return NextResponse.json({
      reply: response.output_text || "No response text returned.",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to get response from OpenAI." },
      { status: 500 },
    );
  }
}
