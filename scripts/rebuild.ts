/**
 * Re-runs normalization over stored raw catalog responses — no network.
 * Use after changing lib/sources/normalize.ts:  npm run db:rebuild
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { closeDb } from "../lib/db/client";
import { listReady, updateDerived } from "../lib/db/objects";
import { rebuild } from "../lib/objects/service";
import { SEED } from "../lib/seed";

async function main() {
  const rows = await listReady();
  for (const row of rows) {
    const seed = SEED.find((s) => s.slug === row.slug);
    try {
      // Seeds get their curated texts; other objects keep the names they were stored with.
      const obj = rebuild(row, seed ? { names: seed.names, descriptions: seed.descriptions, type: seed.type, params: seed.params } : { names: row.names, descriptions: row.descriptions });
      await updateDerived(row.slug, obj);
      console.log(`✓ ${row.slug}`);
    } catch (err) {
      console.log(`✗ ${row.slug}: ${(err as Error).message}`);
    }
  }
  await closeDb();
}

main();
