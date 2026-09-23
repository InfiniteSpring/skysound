import type { ObjectDto } from "../objects/dto";
import type { Candidate, ObjectType } from "../sources/types";

export interface SearchResults {
  local: { slug: string; name: string; type: ObjectType }[];
  remote: Candidate[];
}

export class ObjectFetchError extends Error {
  constructor(
    message: string,
    readonly kind: "not_found" | "unavailable" | "timeout",
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

/** GET /api/objects/[slug], following 202 "pending" answers until the object is ready. */
export async function fetchObject(slug: string, ref?: string, signal?: AbortSignal): Promise<ObjectDto> {
  const url = `/api/objects/${encodeURIComponent(slug)}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const res = await fetch(url, { signal });
    if (res.ok) return ((await res.json()) as { object: ObjectDto }).object;
    const body = (await res.json().catch(() => ({}))) as { retryAfter?: number };
    if (res.status === 202) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (res.status === 404) throw new ObjectFetchError("Каталоги не знают такого объекта", "not_found", body.retryAfter);
    throw new ObjectFetchError("Каталоги сейчас недоступны, попробуйте позже", "unavailable", body.retryAfter);
  }
  throw new ObjectFetchError("Каталоги отвечают слишком долго", "timeout");
}

export async function searchObjects(q: string, signal?: AbortSignal): Promise<SearchResults> {
  const res = await fetch(`/api/objects/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) return { local: [], remote: [] };
  return res.json();
}
