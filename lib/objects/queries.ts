import { cacheLife, cacheTag } from "next/cache";
import * as repo from "../db/objects";
import { toDto, type ObjectDto } from "./dto";

/** Cache tags. `objects` covers lists (sky, sitemap); `object:<slug>` a single page. */
export const tags = {
  list: "objects",
  object: (slug: string) => `object:${slug}`,
};

export type PageObject =
  | { kind: "ready"; object: ObjectDto }
  | { kind: "alias"; target: string }
  | { kind: "missing" }
  | { kind: "failed"; notFound: boolean };

/** Everything the sky needs for every stored object (no raw dumps). */
export async function getSkyObjects(): Promise<ObjectDto[]> {
  "use cache";
  cacheTag(tags.list);
  cacheLife("hours");
  const rows = await repo.listReady();
  return rows.map(toDto);
}

export async function getPageObject(slug: string): Promise<PageObject> {
  "use cache";
  cacheTag(tags.object(slug));
  cacheLife("days");
  const row = await repo.findBySlug(slug);
  if (!row) return { kind: "missing" };
  const alias = repo.aliasTarget(row);
  if (alias) return { kind: "alias", target: alias };
  if (row.status === "ready") return { kind: "ready", object: toDto(row) };
  if (row.status === "failed") return { kind: "failed", notFound: row.error === repo.NOT_FOUND_ERROR };
  return { kind: "missing" };
}
