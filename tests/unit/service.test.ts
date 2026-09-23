/**
 * Integration tests against a real Postgres (TEST_DATABASE_URL, default skysound_test).
 * Covers the DB-first contract: one catalog fetch per object no matter how many callers.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBundle } from "@/lib/sources/types";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { getDb, closeDb } = await import("@/lib/db/client");
const { objects } = await import("@/lib/db/schema");
const repo = await import("@/lib/db/objects");
const { getOrFetchObject } = await import("@/lib/objects/service");
const { sql, eq } = await import("drizzle-orm");

const fixture = (slug: string): RawBundle =>
  JSON.parse(readFileSync(path.join(__dirname, "../fixtures", `${slug}.json`), "utf8"));

function fakeFetcher(slug: string, delayMs = 100) {
  return {
    resolve: vi.fn(async () => "simbad:fake"),
    bundle: vi.fn(async () => {
      await new Promise((r) => setTimeout(r, delayMs));
      return fixture(slug);
    }),
  };
}

beforeAll(async () => {
  await getDb().execute(sql`select 1`);
});
beforeEach(async () => {
  await getDb().delete(objects);
});
afterAll(async () => {
  await closeDb();
});

describe("getOrFetchObject", () => {
  it("fetches once, then serves from the DB", async () => {
    const fetcher = fakeFetcher("algol");
    const first = await getOrFetchObject("algol", { fetcher });
    expect(first).toMatchObject({ status: "ready", fresh: true, object: { type: "variable_star" } });

    const second = await getOrFetchObject("algol", { fetcher });
    expect(second).toMatchObject({ status: "ready", fresh: false });
    expect(fetcher.bundle).toHaveBeenCalledTimes(1);

    const [row] = await getDb().select().from(objects).where(eq(objects.slug, "algol"));
    expect(row.raw.simbad).toBeDefined(); // raw kept for offline rebuilds
  });

  it("deduplicates concurrent requests for the same object", async () => {
    const fetcher = fakeFetcher("delta-cephei", 300);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => getOrFetchObject("delta-cephei", { fetcher, pollMs: 50 })),
    );
    expect(results.every((r) => r.status === "ready")).toBe(true);
    expect(fetcher.bundle).toHaveBeenCalledTimes(1);
  });

  it("makes followers in other processes wait for the leader's row", async () => {
    // Simulate a fetch started elsewhere: the placeholder exists, no in-process promise.
    await repo.claim("betelgeuse", "simbad:* alf Ori", "betelgeuse");
    const fetcher = fakeFetcher("betelgeuse");
    setTimeout(async () => {
      const { normalize } = await import("@/lib/sources/normalize");
      await repo.markReady("betelgeuse", normalize(fixture("betelgeuse"), { slug: "betelgeuse" }), fixture("betelgeuse"));
    }, 250);

    const result = await getOrFetchObject("betelgeuse", { fetcher, pollMs: 50 });
    expect(result.status).toBe("ready");
    expect(fetcher.bundle).not.toHaveBeenCalled();
  });

  it("records failures and respects the retry cooldown", async () => {
    const fetcher = {
      resolve: vi.fn(async () => "simbad:x"),
      bundle: vi.fn(async () => {
        const { CatalogError } = await import("@/lib/sources/types");
        throw new CatalogError("simbad responded 503", "simbad", true);
      }),
    };
    const first = await getOrFetchObject("flaky", { fetcher });
    expect(first).toMatchObject({ status: "failed", retryAfter: 60 });

    const again = await getOrFetchObject("flaky", { fetcher });
    expect(again.status).toBe("failed");
    expect(fetcher.bundle).toHaveBeenCalledTimes(1);

    // Once the cooldown has passed, the next caller retries.
    await getDb()
      .update(objects)
      .set({ updatedAt: new Date(Date.now() - repo.RETRY_AFTER_MS - 1000) })
      .where(eq(objects.slug, "flaky"));
    await getOrFetchObject("flaky", { fetcher });
    expect(fetcher.bundle).toHaveBeenCalledTimes(2);
  });

  it("caches not-found answers", async () => {
    const { NotFoundError } = await import("@/lib/sources/types");
    const fetcher = {
      resolve: vi.fn(async (q: string) => {
        throw new NotFoundError(q);
      }),
      bundle: vi.fn(),
    };
    expect((await getOrFetchObject("no-such-star", { fetcher })).status).toBe("not_found");
    expect((await getOrFetchObject("no-such-star", { fetcher })).status).toBe("not_found");
    expect(fetcher.resolve).toHaveBeenCalledTimes(1);
  });

  it("turns a second slug for the same object into an alias", async () => {
    await getOrFetchObject("algol", { fetcher: fakeFetcher("algol") });
    const fetcher = fakeFetcher("algol");
    const viaAlias = await getOrFetchObject("beta-persei", { fetcher });
    expect(viaAlias).toMatchObject({ status: "ready", object: { slug: "algol" } });

    // The alias now resolves without touching catalogs.
    const again = await getOrFetchObject("beta-persei", { fetcher });
    expect(again).toMatchObject({ status: "ready", object: { slug: "algol" } });
    expect(fetcher.bundle).toHaveBeenCalledTimes(1);
  });

  it("reclaims a fetch whose worker died", async () => {
    await repo.claim("saturn", "jpl:699", "saturn");
    await getDb()
      .update(objects)
      .set({ updatedAt: new Date(Date.now() - repo.STALE_FETCH_MS - 1000) })
      .where(eq(objects.slug, "saturn"));
    const fetcher = fakeFetcher("saturn");
    expect((await getOrFetchObject("saturn", { fetcher })).status).toBe("ready");
    expect(fetcher.bundle).toHaveBeenCalledTimes(1);
  });

  it("searches stored objects by fuzzy name", async () => {
    await getOrFetchObject("delta-cephei", { fetcher: fakeFetcher("delta-cephei") });
    const hits = await repo.searchReady("delta cep");
    expect(hits.map((h) => h.slug)).toContain("delta-cephei");
  });
});
