import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveReview } from "@/lib/session";
export const runtime = "nodejs";
const requestSchema = z.object({
  review: z.unknown(),
  expectedUpdatedAt: z.string(),
  finalize: z.boolean().default(false),
});
export async function POST(request: NextRequest) {
  // Only same-origin browser requests can mutate the local review session.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (
    !host ||
    !/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
    origin !== `http://${host}`
  )
    return NextResponse.json(
      { error: "A same-origin local request is required." },
      { status: 403 },
    );
  try {
    const body = await request.text();
    if (body.length > 2_000_000)
      return NextResponse.json(
        { error: "Review exceeds the 2 MB limit." },
        { status: 413 },
      );
    const input = requestSchema.parse(JSON.parse(body));
    return NextResponse.json(
      await saveReview(input.review, input.expectedUpdatedAt, input.finalize),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save review.",
      },
      { status: 409 },
    );
  }
}
