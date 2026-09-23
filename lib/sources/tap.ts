import { z } from "zod";
import { requestJson } from "./http";
import { CatalogError, type SourceId } from "./types";

/** Compact form of a TAP JSON result that we persist in `raw`. */
export const TapTableSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
});
export type TapTable = z.infer<typeof TapTableSchema>;

const TapResponseSchema = z.object({
  metadata: z.array(z.object({ name: z.string() })),
  data: z.array(z.array(z.unknown())),
});

export function adqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function tapQuery(endpoint: string, adql: string, source: SourceId): Promise<TapTable> {
  const body = new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "json", QUERY: adql });
  const json = await requestJson(endpoint, {
    source,
    timeoutMs: 20_000,
    init: { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  });
  const parsed = TapResponseSchema.safeParse(json);
  if (!parsed.success) throw new CatalogError(`${source} TAP: unexpected response shape`, source, false);
  return { columns: parsed.data.metadata.map((m) => m.name), rows: parsed.data.data };
}

/** Rows as objects keyed by column name. */
export function tapRecords(table: TapTable): Record<string, unknown>[] {
  return table.rows.map((row) => Object.fromEntries(table.columns.map((c, i) => [c, row[i]])));
}

export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
export const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
