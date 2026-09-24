import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json({
      ...(await getSession()),
      runtime: {
        mode:
          process.env.NODE_ENV === "production" ? "production" : "development",
        fingerprint: process.env.PLANORAMA_RUNTIME_FINGERPRINT ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not load plan.",
      },
      { status: 409 },
    );
  }
}
