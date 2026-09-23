import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // `prepare: false` keeps us compatible with transaction-mode poolers (Neon, Supabase).
  const sql = postgres(url, { max: process.env.VERCEL ? 1 : 5, prepare: false, onnotice: () => {} });
  return drizzle(sql, { schema });
}

type Db = ReturnType<typeof createClient>;

// Reuse one pool across hot reloads in dev.
const globalForDb = globalThis as unknown as { __skysoundDb?: Db };

export function getDb(): Db {
  globalForDb.__skysoundDb ??= createClient();
  return globalForDb.__skysoundDb;
}

export async function closeDb() {
  await globalForDb.__skysoundDb?.$client.end();
  globalForDb.__skysoundDb = undefined;
}
