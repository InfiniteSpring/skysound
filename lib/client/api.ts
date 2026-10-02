import type { Lang } from "../i18n/config";
import type { ObjectDto } from "../objects/dto";
import type { Candidate, ObjectType } from "../sources/types";

export interface SearchResults {
  local: { slug: string; name: string; names: Partial<Record<Lang, string>>; type: ObjectType }[];
  remote: Candidate[];
}

/** `kind` maps to a localized message in the UI. */
export class ObjectFetchError extends Error {
  constructor(
    readonly kind: "notFound" | "unavailable" | "timeout",
    readonly retryAfter?: number,
  ) {
    super(kind);
  }
}

/** GET /api/objects/[slug], following 202 "pending" answers until the object is ready. */
export async function fetchObject(
  slug: string,
  opts: { ref?: string; name?: string; lang?: Lang; signal?: AbortSignal } = {},
): Promise<ObjectDto> {
  const { ref, name, lang, signal } = opts;
  const params = new URLSearchParams();
  if (ref) params.set("ref", ref);
  if (ref && name && lang) {
    params.set("name", name);
    params.set("lang", lang);
  }
  const url = `/api/objects/${encodeURIComponent(slug)}${params.size ? `?${params}` : ""}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const res = await fetch(url, { signal });
    if (res.ok) return ((await res.json()) as { object: ObjectDto }).object;
    const body = (await res.json().catch(() => ({}))) as { retryAfter?: number };
    if (res.status === 202) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (res.status === 404) throw new ObjectFetchError("notFound", body.retryAfter);
    throw new ObjectFetchError("unavailable", body.retryAfter);
  }
  throw new ObjectFetchError("timeout");
}

/** `remote: false` searches only the DB (instant); `true` adds catalog results (seconds). */
export async function searchObjects(q: string, lang: Lang, signal?: AbortSignal, remote = true): Promise<SearchResults> {
  const params = new URLSearchParams({ q, lang });
  if (!remote) params.set("remote", "0");
  const res = await fetch(`/api/objects/search?${params}`, { signal });
  if (!res.ok) return { local: [], remote: [] };
  return res.json();
}
