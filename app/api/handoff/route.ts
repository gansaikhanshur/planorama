import { NextResponse } from "next/server";
import path from "node:path";
import { readSessionConfig } from "@/lib/resume";
import { deliveryStatus } from "@/lib/handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    // The agent may already be editing the source after receiving feedback.
    // Delivery receipts still belong to this session's original review.
    const config = process.env.PLANORAMA_SESSION
      ? await readSessionConfig(process.env.PLANORAMA_SESSION)
      : null;
    return NextResponse.json(
      await deliveryStatus(
        config?.outputDir ?? path.join(process.cwd(), ".planorama/demo"),
      ),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Review connection unavailable." },
      { status: 409 },
    );
  }
}
