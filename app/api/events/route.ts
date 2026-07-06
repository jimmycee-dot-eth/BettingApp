import { NextResponse } from "next/server";
import { buildEvents } from "@/lib/aggregate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await buildEvents();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Failed to build events" },
      { status: 500 },
    );
  }
}
