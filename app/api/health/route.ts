import { sql } from "drizzle-orm";
import { connection, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

/** Liveness + DB check for container healthchecks and uptime monitors. Never cached. */
export async function GET() {
  await connection();
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true, db: "up" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
