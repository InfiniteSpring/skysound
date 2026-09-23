import { z } from "zod";
import { slugify } from "../slug";
import { requestText } from "./http";
import { CatalogError, type SourceAdapter } from "./types";

const PSRCAT = "https://www.atnf.csiro.au/research/pulsar/psrcat/proc_form.php";
const FIELDS = ["JName", "RaJD", "DecJD", "P0", "P1", "DM", "Dist", "Age", "Edot"] as const;

/** The <pre> block of the psrcat "Short without errors" table — the only part we need. */
export const AtnfRawSchema = z.object({ query: z.string(), table: z.string() });
export type AtnfRaw = z.infer<typeof AtnfRawSchema>;

export interface AtnfParsed {
  jname: string;
  ra: number;
  dec: number;
  periodS: number;
  periodDot?: number;
  dmPcCm3?: number;
  distanceKpc?: number;
  ageYr?: number;
  edotErgS?: number;
}

const PULSAR_NAME = /^(?:PSR\s*)?([JB]\d{4}[+-]\d{2,4}[A-Z]?)$/i;

export function normalizePulsarName(query: string): string | null {
  const m = query.trim().replace(/\s+/g, "").match(PULSAR_NAME);
  return m ? m[1].toUpperCase() : null;
}

function buildUrl(names: string) {
  const params = new URLSearchParams({
    version: "2.6.1",
    startUserDefined: "true",
    pulsar_names: names,
    ephemeris: "short",
    coords_unit: "raj/decj",
    style: "Short without errors",
    no_value: "*",
    state: "query",
    "table_bottom.x": "0",
    "table_bottom.y": "0",
  });
  for (const f of FIELDS) params.set(f, f);
  return `${PSRCAT}?${params}`;
}

const val = (s: string | undefined) => {
  if (s === undefined || s === "*") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export function parseAtnf(raw: AtnfRaw): AtnfParsed[] {
  return raw.table
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\s+[JB]\d{4}/.test(line))
    .map((line) => {
      const [, jname, ra, dec, p0, p1, dm, dist, age, edot] = line.split(/\s+/);
      return {
        jname,
        ra: val(ra) ?? 0,
        dec: val(dec) ?? 0,
        periodS: val(p0) ?? 0,
        periodDot: val(p1),
        dmPcCm3: val(dm),
        distanceKpc: val(dist),
        ageYr: val(age),
        edotErgS: val(edot),
      };
    })
    .filter((p) => p.periodS > 0);
}

export const atnf: SourceAdapter<AtnfRaw> = {
  id: "atnf",

  async search(query) {
    const name = normalizePulsarName(query);
    if (!name) return [];
    const parsed = parseAtnf(await this.fetch(name));
    return parsed.map((p) => ({
      source: "atnf" as const,
      ref: `atnf:${p.jname}`,
      name: `PSR ${p.jname}`,
      slug: slugify(`PSR ${p.jname}`),
      type: "pulsar" as const,
      hint: `ATNF · P = ${p.periodS} s`,
    }));
  },

  /**
   * `names` may be a comma-separated alias list. psrcat rejects the whole query if any
   * name is unknown, and SIMBAD's J-names are sometimes truncated differently, so aliases
   * are tried one by one (B-names first: they are unambiguous).
   */
  async fetch(names) {
    const aliases = names
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .sort((a, b) => Number(b.startsWith("B")) - Number(a.startsWith("B")));
    for (const name of aliases) {
      const html = await requestText(buildUrl(name), { source: "atnf", timeoutMs: 20_000 });
      const table = html.match(/<pre>([\s\S]*?)<\/pre>/i)?.[1];
      if (!table) throw new CatalogError("ATNF: no result table in response", "atnf", true);
      if (/^\s*\d+\s+[JB]\d{4}/m.test(table)) return { query: name, table };
    }
    throw new CatalogError(`ATNF does not know ${names}`, "atnf", false);
  },
};

export function atnfUrl(jname: string) {
  return buildUrl(jname);
}
