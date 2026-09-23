/**
 * Fills the DB with the seed objects through the same sources module the API uses.
 *   npm run db:seed            # all seed objects
 *   npm run db:seed -- sun     # only the given slugs
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { closeDb } from "../lib/db/client";
import { ingest } from "../lib/objects/service";
import { SEED } from "../lib/seed";

async function main() {
  const only = process.argv.slice(2);
  let failed = 0;
  for (const entry of SEED.filter((e) => !only.length || only.includes(e.slug))) {
    process.stdout.write(`${entry.slug.padEnd(14)} `);
    const result = await ingest(entry.slug, entry.ref, { name: entry.name, description: entry.description });
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
