import type { ObjectRow } from "../db/schema";
import type { SpaceObject } from "../sources/types";

/** What clients receive: the normalized object, never the raw catalog dumps. */
export type ObjectDto = SpaceObject & { fetchedAt: string | null };

export function toDto(row: ObjectRow): ObjectDto {
  if (row.status !== "ready" || !row.type || !row.position || !row.canonicalKey) {
    throw new Error(`Object ${row.slug} is not ready`);
  }
  return {
    slug: row.slug,
    canonicalKey: row.canonicalKey,
    name: row.name,
    names: row.names ?? {},
    descriptions: row.descriptions ?? {},
    type: row.type,
    position: row.position,
    params: row.params,
    lightCurve: row.lightCurve ?? null,
    sources: row.sources,
    fetchedAt: row.fetchedAt?.toISOString() ?? null,
  };
}
