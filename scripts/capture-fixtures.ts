/**
 * Records real catalog responses for the seed objects into tests/fixtures/*.json,
 * so adapter/normalizer tests run offline against genuine data.
 *   npm run fixtures
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SEED } from "../lib/seed";
import { fetchBundle, normalize } from "../lib/sources";

const dir = path.join(process.cwd(), "tests/fixtures");

async function main() {
  await mkdir(dir, { recursive: true });
  const only = process.argv.slice(2);
  for (const entry of SEED.filter((e) => !only.length || only.includes(e.slug))) {
    process.stdout.write(`${entry.slug} … `);
    const bundle = await fetchBundle(entry.ref);
    await writeFile(path.join(dir, `${entry.slug}.json`), JSON.stringify(bundle, null, 1));
    const obj = normalize(bundle, { slug: entry.slug });
    console.log(obj.type, obj.name, JSON.stringify(obj.params));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
