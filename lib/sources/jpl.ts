import { z } from "zod";
import { slugify } from "../slug";
import { requestJson } from "./http";
import { CatalogError, type ObjectType, type SourceAdapter } from "./types";

const HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api";
const LOOKUP = "https://ssd.jpl.nasa.gov/api/horizons_lookup.api";

export const JplRawSchema = z.object({
  /** Horizons COMMAND value: a major-body id ("599") or a small-body query ("DES=1P;CAP;NOFRAG"). */
  command: z.string(),
  kind: z.enum(["major", "small"]),
  date: z.string(),
  result: z.string(),
});
export type JplRaw = z.infer<typeof JplRawSchema>;

export interface JplParsed {
  name: string;
  id: string;
  ra?: number;
  dec?: number;
  deltaAu?: number;
  orbitalPeriodDays?: number;
  rotationPeriodS?: number;
  temperatureK?: number;
  luminosityW?: number;
}

const LookupSchema = z.object({
  result: z
    .array(
      z.object({
        spkid: z.string(),
        name: z.string(),
        type: z.string(),
        pdes: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

export function classifyJpl(type: string, name: string): ObjectType | null {
  if (type === "barycenter" || type.includes("spacecraft")) return null;
  if (type === "Sun" || name === "Sun") return "star";
  if (type === "planet") return name === "Pluto" ? "small_body" : "planet";
  if (type.includes("satellite")) return "moon";
  if (type.includes("asteroid") || type.includes("comet") || type.includes("dwarf")) return "small_body";
  return null;
}

/** Major bodies are addressed by SPK id; small bodies by designation. */
export function jplRef(hit: { spkid: string; type: string; pdes?: string | null; name: string }) {
  if (!/asteroid|comet/.test(hit.type)) return `jpl:${hit.spkid}`;
  const des = hit.pdes ?? hit.name;
  return hit.type.includes("comet") ? `jpl:DES=${des};CAP;NOFRAG` : `jpl:DES=${des};`;
}

const firstNumber = (text: string, patterns: RegExp[]) => {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const v = Number(m[1]);
      if (Number.isFinite(v) && v > 0) return { value: v, unit: m[2] };
    }
  }
  return undefined;
};

export function parseJpl(raw: JplRaw): JplParsed {
  const text = raw.result;
  const name =
    text.match(/Target body name:\s*(.+?)\s+(?:\(([^)]+)\))?\s*\{/)?.[1]?.trim() ??
    text.match(/Target body name:\s*(.+)/)?.[1]?.trim() ??
    raw.command;

  const row = text.match(/\$\$SOE\s*\n\s*\S+\s+\S+\s+(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.Ee+-]+)/);

  const orbit = firstNumber(text, [
    /Sidereal orb(?:it)?\.? per(?:iod|\.)?\s*=\s*([\d.]+)\s*(d)\b/i,
    /Orbit(?:al)? period\s*=\s*([\d.]+)\s*(d)\b/i,
    /Sidereal orb(?:it)?\.? per(?:iod|\.)?\s*=\s*([\d.]+)\s*(y|yr)\b/i,
    /\bPER=\s*([\d.]+)()/, // small-body elements, Julian years
  ]);
  const orbitalPeriodDays = orbit ? (orbit.unit === "d" ? orbit.value : orbit.value * 365.25) : undefined;

  let rotationPeriodS: number | undefined;
  const hms = text.match(/Sid(?:ereal)?\.? rot(?:ation|\.)? per(?:iod|\.)?\s*(?:\([^)]*\))?\s*=\s*(\d+)h\s*(\d+)m\s*([\d.]+)\s*s/i);
  if (hms) rotationPeriodS = Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  rotationPeriodS ??= (() => {
    const r = firstNumber(text, [
      /(?:Adopted )?sid(?:ereal)?\.? rot(?:ation|\.)? per(?:iod|\.)?\s*(?:\([^)]*\))?\s*=\s*([\d.]+)\s*(d|h|hr|hrs)\b/i,
      /ROTPER=\s*([\d.]+)()/,
    ]);
    if (r) return r.value * (r.unit === "d" ? 86400 : 3600);
    const rate = firstNumber(text, [/rot\.? rate,?\s*\(?rad\/s\)?\s*=\s*([\d.Ee-]+)()/i]);
    return rate ? (2 * Math.PI) / rate.value : undefined;
  })();

  const temp = firstNumber(text, [
    /Effective temp,? K\s*=\s*([\d.]+)()/i,
    /Mean surface temp \(Ts\),? K\s*=\s*([\d.]+)()/i,
    /Mean Temperature \(K\)\s*=\s*([\d.]+)()/i,
    /Atmos\. temp\. \(1 bar\)\s*=\s*([\d.]+)()/i,
    /Mean effect\. temp \(Te\),? K\s*=\s*([\d.]+)()/i,
    /Surface temp(?:erature)?,? K\s*=\s*~?([\d.]+)()/i,
  ]);
  const lum = firstNumber(text, [/Luminosity, 10\^24 J\/s\s*=\s*([\d.]+)()/i]);

  return {
    name,
    id: raw.command,
    ra: row ? Number(row[1]) : undefined,
    dec: row ? Number(row[2]) : undefined,
    deltaAu: row ? Number(row[3]) : undefined,
    orbitalPeriodDays,
    rotationPeriodS,
    temperatureK: temp?.value,
    luminosityW: lum ? lum.value * 1e24 : undefined,
  };
}

export const jpl: SourceAdapter<JplRaw> & { lookup(query: string): Promise<z.infer<typeof LookupSchema>["result"]> } = {
  id: "jpl",

  async lookup(query) {
    const json = await requestJson(`${LOOKUP}?${new URLSearchParams({ sstr: query })}`, { source: "jpl" });
    return LookupSchema.parse(json).result ?? [];
  },

  async search(query) {
    const hits = (await this.lookup(query)) ?? [];
    return hits
      .map((h) => ({ h, type: classifyJpl(h.type, h.name) }))
      .filter((x): x is { h: (typeof hits)[number]; type: ObjectType } => x.type !== null)
      .slice(0, 5)
      .map(({ h, type }) => ({
        source: "jpl" as const,
        ref: jplRef(h),
        name: h.name,
        slug: slugify(h.name),
        type,
        hint: `JPL Horizons · ${h.type}`,
      }));
  },

  async fetch(command, date = new Date()) {
    const day = date.toISOString().slice(0, 10);
    const next = new Date(date.getTime() + 86_400_000).toISOString().slice(0, 10);
    const params = new URLSearchParams({
      format: "json",
      COMMAND: `'${command}'`,
      OBJ_DATA: "YES",
      MAKE_EPHEM: "YES",
      EPHEM_TYPE: "OBSERVER",
      CENTER: "'500@399'",
      START_TIME: `'${day}'`,
      STOP_TIME: `'${next}'`,
      STEP_SIZE: "'1d'",
      QUANTITIES: "'1,20'",
      ANG_FORMAT: "DEG",
    });
    const json = (await requestJson(`${HORIZONS}?${params}`, { source: "jpl", timeoutMs: 25_000 })) as {
      result?: string;
      error?: string;
    };
    if (!json.result || !json.result.includes("$$SOE")) {
      throw new CatalogError(`Horizons could not produce an ephemeris for ${command}`, "jpl", false);
    }
    return { command, kind: command.startsWith("DES=") ? "small" : "major", date: day, result: json.result };
  },
} as SourceAdapter<JplRaw> & { lookup(query: string): Promise<z.infer<typeof LookupSchema>["result"]> };

export function jplUrl(command: string) {
  return `https://ssd.jpl.nasa.gov/horizons/app.html#/?sstr=${encodeURIComponent(command.replace(/^DES=|;.*$/g, ""))}`;
}
