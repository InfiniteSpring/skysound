import * as repo from "../db/objects";
import type { Lang } from "../i18n/config";
import type { ObjectRow } from "../db/schema";
import { slugToQuery } from "../slug";
import { fetchBundle, normalize, resolveQuery } from "../sources";
import { CatalogError, NotFoundError, type RawBundle, type SpaceObject } from "../sources/types";
import { toDto, type ObjectDto } from "./dto";

export type GetResult =
  | { status: "ready"; object: ObjectDto; /** true when this call fetched it from catalogs */ fresh: boolean }
  | { status: "not_found"; retryAfter: number }
  | { status: "failed"; error: string; retryAfter: number }
  | { status: "pending" };

export interface Overrides {
  names?: Partial<Record<Lang, string>>;
  descriptions?: Partial<Record<Lang, string>>;
}

/** Catalog access, injectable so tests can count calls without the network. */
export interface Fetcher {
  resolve(query: string): Promise<string>;
  bundle(ref: string): Promise<RawBundle>;
}

export const catalogFetcher: Fetcher = { resolve: resolveQuery, bundle: fetchBundle };

const REF = /^(jpl|simbad|atnf|gaia|vsx):/;

export interface GetOptions {
  /** Catalog ref ("simbad:* alf Ori") or free text; defaults to the de-slugified slug. */
  query?: string;
  overrides?: Overrides;
  fetcher?: Fetcher;
  /** How long a follower waits for another worker's fetch before answering "pending". */
  waitMs?: number;
  pollMs?: number;
}

/** Same-process followers share the leader's promise instead of polling the DB. */
const inflight = new Map<string, Promise<GetResult>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function settled(row: ObjectRow): Promise<GetResult | null> {
  if (row.status === "ready") return { status: "ready", object: toDto(row), fresh: false };
  const target = repo.aliasTarget(row);
  if (target) {
    const twin = await repo.findBySlug(target);
    return twin ? settled(twin) : { status: "pending" };
  }
  if (row.status === "failed") {
    return row.error === repo.NOT_FOUND_ERROR
      ? { status: "not_found", retryAfter: repo.retryAfterSeconds(row) }
      : { status: "failed", error: row.error ?? "unknown error", retryAfter: repo.retryAfterSeconds(row) };
  }
  return null;
}

async function lead(slug: string, query: string, opts: GetOptions): Promise<GetResult> {
  const fetcher = opts.fetcher ?? catalogFetcher;
  try {
    console.info(`[objects] fetching "${slug}" from catalogs (${query})`);
    const ref = REF.test(query) ? query : await fetcher.resolve(query);
    const bundle = await fetcher.bundle(ref);
    const obj = normalize(bundle, { slug, ...opts.overrides });

    // Another slug may already hold this object ("alf-ori" vs "betelgeuse"): keep one copy
    // and turn this slug into an alias, so it too resolves from the DB from now on.
    const twin = await repo.findByCanonicalKey(obj.canonicalKey);
    if (twin && twin.slug !== slug) {
      await repo.markAlias(slug, twin.slug);
      return (await settled(twin)) ?? { status: "pending" };
    }

    const row = await repo.markReady(slug, obj, bundle);
    return { status: "ready", object: toDto(row), fresh: true };
  } catch (err) {
    if (err instanceof NotFoundError || (err instanceof CatalogError && !err.retryable && /does not know|no basic data/.test(err.message))) {
      await repo.markFailed(slug, repo.NOT_FOUND_ERROR);
      return { status: "not_found", retryAfter: repo.NOT_FOUND_RETRY_AFTER_MS / 1000 };
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[objects] fetch failed for ${slug}:`, message);
    await repo.markFailed(slug, message);
    return { status: "failed", error: message, retryAfter: repo.RETRY_AFTER_MS / 1000 };
  }
}

function leadOnce(slug: string, query: string, opts: GetOptions) {
  const p = lead(slug, query, opts).finally(() => inflight.delete(slug));
  inflight.set(slug, p);
  return p;
}

/**
 * DB-first lookup. Ready rows return immediately. Otherwise exactly one caller (across all
 * processes, via the unique slug) queries the catalogs; everyone else waits for its result.
 */
export async function getOrFetchObject(slug: string, opts: GetOptions = {}): Promise<GetResult> {
  const local = inflight.get(slug);
  if (local) return local;

  const query = opts.query?.trim() || slugToQuery(slug);
  let row = await repo.findBySlug(slug);

  if (!row) {
    const claimed = await repo.claim(slug, query, opts.overrides?.names?.en ?? query);
    if (claimed) return leadOnce(slug, query, opts);
    row = await repo.findBySlug(slug);
    if (!row) return { status: "pending" };
  }

  if (row.status === "ready" || repo.aliasTarget(row)) return (await settled(row))!;

  // Failed past its cooldown, or a fetch whose worker died: take over.
  if (await repo.reclaim(slug)) return leadOnce(slug, row.query, opts);
  if (row.status === "failed") return (await settled(row))!;

  return waitForFetch(slug, opts);
}

async function waitForFetch(slug: string, opts: GetOptions): Promise<GetResult> {
  const deadline = Date.now() + (opts.waitMs ?? 45_000);
  const pollMs = opts.pollMs ?? 400;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const local = inflight.get(slug);
    if (local) return local;
    const row = await repo.findBySlug(slug);
    if (!row) return { status: "pending" };
    const done = await settled(row);
    if (done) return done;
  }
  return { status: "pending" };
}

/** Force a fresh fetch (seed / cron refresh). Not deduplicated — for scripts, not requests. */
export async function ingest(slug: string, query: string, overrides: Overrides = {}, fetcher = catalogFetcher) {
  const existing = await repo.findBySlug(slug);
  if (!existing) await repo.claim(slug, query, overrides.names?.en ?? query);
  return lead(slug, query, { overrides, fetcher });
}

/** Rebuild params from stored raw responses without touching the catalogs. */
export function rebuild(row: ObjectRow, overrides: Overrides = {}): SpaceObject {
  return normalize(row.raw, { slug: row.slug, ...overrides });
}
