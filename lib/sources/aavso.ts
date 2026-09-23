import { z } from "zod";
import { slugify } from "../slug";
import { requestText } from "./http";
import type { SourceAdapter } from "./types";

/**
 * AAVSO's International Variable Star Index (VSX). The AAVSO API itself sits behind a
 * browser challenge, so we read the same catalog from its VizieR mirror (B/vsx/vsx).
 */
const VIZIER = "https://vizier.cds.unistra.fr/viz-bin/asu-tsv";

export const VsxRawSchema = z.object({ target: z.string(), tsv: z.string() });
export type VsxRaw = z.infer<typeof VsxRawSchema>;

export interface VsxParsed {
  name: string;
  type: string;
  maxMag?: number;
  minMag?: number;
  periodDays?: number;
  epochJd?: number;
  /** "(" in VSX means `min` is an amplitude, not a magnitude. */
  minIsAmplitude: boolean;
  separationArcsec?: number;
}

function buildUrl(target: string, radiusArcsec: number) {
  const params = new URLSearchParams({
    "-source": "B/vsx/vsx",
    "-c": target,
    "-c.rs": String(radiusArcsec),
    "-out": "Name,Type,max,min,f_min,Period,Epoch",
    "-out.add": "_r",
    "-sort": "_r",
    "-out.max": "5",
    "-out.form": "mini",
  });
  return `${VIZIER}?${params}`;
}

const n = (s: string | undefined) => {
  const v = Number(s?.trim());
  return s?.trim() && Number.isFinite(v) ? v : undefined;
};

export function parseVsx(raw: VsxRaw): VsxParsed[] {
  const lines = raw.tsv.split("\n").filter((l) => l && !l.startsWith("#"));
  const header = lines[0]?.split("\t").map((h) => h.trim());
  if (!header?.includes("Name")) return [];
  return lines
    .slice(3) // header, units, dashes
    .map((line) => {
      const cells = Object.fromEntries(line.split("\t").map((c, i) => [header[i], c.trim()]));
      return {
        name: cells.Name,
        type: cells.Type,
        maxMag: n(cells.max),
        minMag: n(cells.min),
        periodDays: n(cells.Period),
        epochJd: n(cells.Epoch),
        minIsAmplitude: cells.f_min === "(",
        separationArcsec: n(cells._r) !== undefined ? n(cells._r)! * 60 : undefined,
      } satisfies VsxParsed;
    })
    .filter((v) => v.name);
}

export function vsxAmplitude(v: VsxParsed): number | undefined {
  if (v.minMag === undefined) return undefined;
  if (v.minIsAmplitude) return v.minMag;
  return v.maxMag !== undefined ? Math.abs(v.minMag - v.maxMag) : undefined;
}

export const vsx: SourceAdapter<VsxRaw> = {
  id: "vsx",

  /** VizieR resolves names via Sesame, so a name works as a cone-search centre. */
  async search(query) {
    const hits = parseVsx(await this.fetch(query));
    return hits.slice(0, 1).map((v) => ({
      source: "vsx" as const,
      ref: `vsx:${v.name}`,
      name: v.name,
      slug: slugify(v.name),
      type: "variable_star" as const,
      hint: `VSX · ${v.type}${v.periodDays ? ` · P = ${v.periodDays} d` : ""}`,
    }));
  },

  /** `target` is "ra dec" in degrees or an object name. */
  async fetch(target) {
    const tsv = await requestText(buildUrl(target, 20), { source: "vsx", timeoutMs: 20_000 });
    return { target, tsv };
  },
};

export function vsxUrl(name: string) {
  return `https://www.aavso.org/vsx/index.php?view=results.get&ident=${encodeURIComponent(name)}`;
}
