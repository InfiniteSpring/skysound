import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import type { RawBundle, SpaceObject } from "../sources/types";
import { getDb } from "./client";
import { objects, type ObjectRow } from "./schema";

/** A failed fetch may be retried after this long (not-found answers are cached longer). */
export const RETRY_AFTER_MS = 60_000;
export const NOT_FOUND_RETRY_AFTER_MS = 10 * 60_000;
/** A `fetching` row older than this is assumed orphaned (its worker died) and may be reclaimed. */
export const STALE_FETCH_MS = 90_000;

export const NOT_FOUND_ERROR = "not_found";
/** A slug that resolved to an object already stored under another slug ("alias:betelgeuse"). */
export const ALIAS_PREFIX = "alias:";

export async function findBySlug(slug: string) {
  const [row] = await getDb().select().from(objects).where(eq(objects.slug, slug)).limit(1);
  return row ?? null;
}

export async function findByCanonicalKey(key: string) {
  const [row] = await getDb().select().from(objects).where(eq(objects.canonicalKey, key)).limit(1);
  return row ?? null;
}

/**
 * Atomically create a `fetching` placeholder. The unique slug index makes this the lock:
 * exactly one concurrent caller gets a row back and becomes the fetcher.
 */
export async function claim(slug: string, query: string, name: string): Promise<ObjectRow | null> {
  const [row] = await getDb()
    .insert(objects)
    .values({ slug, query, name, status: "fetching" })
    .onConflictDoNothing({ target: objects.slug })
    .returning();
  return row ?? null;
}

/** Take over a row whose retry cooldown has passed or whose fetcher went silent. */
export async function reclaim(slug: string): Promise<ObjectRow | null> {
  const now = Date.now();
  const [row] = await getDb()
    .update(objects)
    .set({ status: "fetching", error: null, updatedAt: new Date() })
    .where(
      and(
        eq(objects.slug, slug),
        sql`coalesce(${objects.error}, '') not like ${ALIAS_PREFIX + "%"}`,
        or(
          and(
            eq(objects.status, "failed"),
            or(
              and(eq(objects.error, NOT_FOUND_ERROR), lt(objects.updatedAt, new Date(now - NOT_FOUND_RETRY_AFTER_MS))),
              and(sql`${objects.error} is distinct from ${NOT_FOUND_ERROR}`, lt(objects.updatedAt, new Date(now - RETRY_AFTER_MS))),
            ),
          ),
          and(eq(objects.status, "fetching"), lt(objects.updatedAt, new Date(now - STALE_FETCH_MS))),
        ),
      ),
    )
    .returning();
  return row ?? null;
}

export async function markReady(slug: string, obj: SpaceObject, raw: RawBundle) {
  const now = new Date();
  const [row] = await getDb()
    .update(objects)
    .set({
      canonicalKey: obj.canonicalKey,
      name: obj.name,
      names: obj.names,
      descriptions: obj.descriptions,
      type: obj.type,
      position: obj.position,
      params: obj.params,
      lightCurve: obj.lightCurve,
      sources: obj.sources,
      raw,
      status: "ready",
      error: null,
      fetchedAt: now,
      updatedAt: now,
    })
    .where(eq(objects.slug, slug))
    .returning();
  return row;
}

/** Rewrite derived columns only (used when normalization logic changes; raw stays as fetched). */
export async function updateDerived(slug: string, obj: SpaceObject) {
  await getDb()
    .update(objects)
    .set({
      name: obj.name,
      names: obj.names,
      descriptions: obj.descriptions,
      type: obj.type,
      position: obj.position,
      params: obj.params,
      lightCurve: obj.lightCurve,
      sources: obj.sources,
      canonicalKey: obj.canonicalKey,
      updatedAt: new Date(),
    })
    .where(eq(objects.slug, slug));
}

export async function markFailed(slug: string, error: string) {
  await getDb()
    .update(objects)
    .set({ status: "failed", error: error.slice(0, 500), updatedAt: new Date() })
    .where(eq(objects.slug, slug));
}

export async function markAlias(slug: string, targetSlug: string) {
  await markFailed(slug, ALIAS_PREFIX + targetSlug);
}

export function aliasTarget(row: Pick<ObjectRow, "status" | "error">) {
  return row.status === "failed" && row.error?.startsWith(ALIAS_PREFIX) ? row.error.slice(ALIAS_PREFIX.length) : null;
}

export async function listReady() {
  return getDb().select().from(objects).where(eq(objects.status, "ready")).orderBy(objects.createdAt);
}

/** Trigram + substring search over stored, ready objects, in every language they are named in. */
export async function searchReady(q: string, limit = 8) {
  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const localized = sql`exists (select 1 from jsonb_each_text(${objects.names}) as n where n.value ilike ${pattern})`;
  const score = sql<number>`greatest(similarity(${objects.name}, ${q}), similarity(${objects.slug}, ${q}), case when ${localized} then 1 else 0 end)`;
  return getDb()
    .select()
    .from(objects)
    .where(
      and(
        eq(objects.status, "ready"),
        or(ilike(objects.name, pattern), ilike(objects.slug, pattern), sql`${objects.name} % ${q}`, localized),
      ),
    )
    .orderBy(desc(score))
    .limit(limit);
}

export function retryAfterSeconds(row: Pick<ObjectRow, "updatedAt" | "error">) {
  const wait = row.error === NOT_FOUND_ERROR ? NOT_FOUND_RETRY_AFTER_MS : RETRY_AFTER_MS;
  return Math.max(0, Math.ceil((row.updatedAt.getTime() + wait - Date.now()) / 1000));
}
