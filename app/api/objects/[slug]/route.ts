import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getOrFetchObject } from "@/lib/objects/service";
import { tags } from "@/lib/objects/queries";
import { DEFAULT_LANG, isLang } from "@/lib/i18n/config";
import { isValidSlug } from "@/lib/slug";

// The first request for an unknown object waits on catalogs (SIMBAD, Gaia, ATNF, Horizons).
export const maxDuration = 60;

const REF = /^(jpl|simbad|atnf|gaia|vsx):.{1,120}$/;

/**
 * DB-first object lookup.
 *   200 { object }                 — ready (from DB, or just fetched and stored)
 *   202 { status: "pending" }      — another worker is still fetching; retry shortly
 *   404 { error: "not_found" }     — no catalog knows it
 *   503 { error, retryAfter }      — catalogs failed; retry after the cooldown
 * `?ref=simbad:* alf Ori` (from search results) tells the fetcher exactly what to load;
 * `&name=Бетельгейзе&lang=ru` sets the localized display name for a newly stored object
 * (English names always come from the catalogs).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/objects/[slug]">) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) return NextResponse.json({ error: "bad_slug" }, { status: 400 });

  const ref = request.nextUrl.searchParams.get("ref") ?? undefined;
  if (ref && !REF.test(ref)) return NextResponse.json({ error: "bad_ref" }, { status: 400 });

  // Display name chosen in search (e.g. the Russian label from Wikidata) in the viewer's language;
  // only used when the object is first stored.
  const name = request.nextUrl.searchParams.get("name")?.trim().slice(0, 80) || undefined;
  const langParam = request.nextUrl.searchParams.get("lang");
  const lang = isLang(langParam) ? langParam : DEFAULT_LANG;

  const result = await getOrFetchObject(slug, {
    query: ref,
    overrides: name && lang !== DEFAULT_LANG ? { names: { [lang]: name } } : undefined,
  });

  switch (result.status) {
    case "ready":
      if (result.fresh || result.object.slug !== slug) {
        revalidateTag(tags.list, "max");
        revalidateTag(tags.object(slug), { expire: 0 });
        revalidateTag(tags.object(result.object.slug), { expire: 0 });
      }
      return NextResponse.json(
        { object: result.object },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" } },
      );
    case "pending":
      return NextResponse.json({ status: "pending" }, { status: 202, headers: { "Retry-After": "2" } });
    case "not_found":
      revalidateTag(tags.object(slug), { expire: 0 });
      return NextResponse.json({ error: "not_found", retryAfter: result.retryAfter }, { status: 404 });
    case "failed":
      return NextResponse.json(
        { error: "catalog_unavailable", detail: result.error, retryAfter: result.retryAfter },
        { status: 503, headers: { "Retry-After": String(result.retryAfter) } },
      );
  }
}
