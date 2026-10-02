import { inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { searchReady } from "@/lib/db/objects";
import { objects } from "@/lib/db/schema";
import { toDto } from "@/lib/objects/dto";
import { DEFAULT_LANG, isLang } from "@/lib/i18n/config";
import { searchCatalogs } from "@/lib/sources";

export const maxDuration = 30;

/**
 * Search stored objects first, then the catalogs. Catalog hits that are already stored
 * (matched by canonical key) are returned as local results, so they open instantly.
 *   ?q=betelgeuse&remote=0  — DB only
 *   &lang=zh                 — also resolve names in that language via Wikidata
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const remote = request.nextUrl.searchParams.get("remote") !== "0";
  const langParam = request.nextUrl.searchParams.get("lang");
  const lang = isLang(langParam) ? langParam : DEFAULT_LANG;
  if (q.length < 2) return NextResponse.json({ local: [], remote: [] });

  const localRows = await searchReady(q);
  let candidates = remote && q.length >= 2 ? await searchCatalogs(q, lang) : [];

  if (candidates.length) {
    const known = await getDb()
      .select()
      .from(objects)
      .where(inArray(objects.canonicalKey, candidates.map((c) => c.ref)));
    const knownKeys = new Set(known.map((r) => r.canonicalKey));
    for (const row of known) if (row.status === "ready" && !localRows.some((l) => l.slug === row.slug)) localRows.push(row);
    const localSlugs = new Set(localRows.map((r) => r.slug));
    candidates = candidates.filter((c) => !knownKeys.has(c.ref) && !localSlugs.has(c.slug));
  }

  return NextResponse.json({
    local: localRows.map(toDto).map(({ slug, name, names, type }) => ({ slug, name, names, type })),
    remote: candidates,
  });
}
