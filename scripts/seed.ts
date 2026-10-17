/**
 * Fills the DB with the seed objects through the same sources module the API uses.
 *   npm run db:seed                                  # all seed objects, live from the catalogs
 *   npm run db:seed -- sun                           # only the given slugs
 *   npm run db:seed -- --if-empty                    # do nothing if the DB already has objects
 *   npm run db:seed -- --fallback-fixtures           # catalog down? use the saved responses
 *   npm run db:seed -- --fixtures                    # offline: saved responses only
 * Saved responses are the test fixtures (tests/fixtures/<slug>.json, `npm run fixtures`).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile } from "node:fs/promises";
import path from "node:path";
import { closeDb } from "../lib/db/client";
import * as repo from "../lib/db/objects";
import { catalogFetcher, ingest, type Fetcher } from "../lib/objects/service";
import { SEED } from "../lib/seed";
import type { RawBundle } from "../lib/sources/types";

const fixtureFetcher = (slug: string): Fetcher => ({
  resolve: async (query) => query,
  bundle: async () => JSON.parse(await readFile(path.join(process.cwd(), "tests/fixtures", `${slug}.json`), "utf8")) as RawBundle,
});

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const only = args.filter((a) => !a.startsWith("--"));
  if (flags.has("--if-empty") && (await repo.listReady()).length) {
    console.log("DB already has objects, skipping the seed.");
    await closeDb();
    return;
  }
  let failed = 0;
  for (const entry of SEED.filter((e) => !only.length || only.includes(e.slug))) {
    process.stdout.write(`${entry.slug.padEnd(14)} `);
    const overrides = { names: entry.names, descriptions: entry.descriptions, type: entry.type, params: entry.params };
    let result = await ingest(entry.slug, entry.ref, overrides, flags.has("--fixtures") ? fixtureFetcher(entry.slug) : catalogFetcher);
    if (result.status !== "ready" && flags.has("--fallback-fixtures")) {
      process.stdout.write("(live failed, using saved data) ");
      result = await ingest(entry.slug, entry.ref, overrides, fixtureFetcher(entry.slug));
    }
    if (result.status === "ready") {
      console.log(`✓ ${result.object.type.padEnd(14)} ${JSON.stringify(result.object.params)}`);
    } else {
      failed++;
      console.log(`✗ ${result.status}${"error" in result ? `: ${result.error}` : ""}`);
    }
  }
  await closeDb();
  if (failed) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
