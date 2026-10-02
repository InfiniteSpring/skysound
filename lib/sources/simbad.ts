import { z } from "zod";
import { slugify } from "../slug";
import { requestText } from "./http";
import { adqlString, num, str, tapQuery, tapRecords, TapTableSchema } from "./tap";
import { CatalogError, type Candidate, type ObjectType, type SourceAdapter } from "./types";

const TAP = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync";
const SESAME = "https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/S";

export const SimbadRawSchema = z.object({
  mainId: z.string(),
  basic: TapTableSchema,
  ids: TapTableSchema,
  teff: TapTableSchema,
  flux: TapTableSchema,
});
export type SimbadRaw = z.infer<typeof SimbadRawSchema>;

export interface SimbadParsed {
  oid: number;
  mainId: string;
  displayName: string;
  ra: number;
  dec: number;
  otype: string;
  parallaxMas?: number;
  spectralType?: string;
  teffK?: number;
  vmag?: number;
  ids: string[];
  gaiaDr3?: string;
  /** All PSR aliases (J and B names); catalogs disagree on J-name precision, so ATNF gets them all. */
  pulsarNames: string[];
}

const GREEK: Record<string, string> = {
  alf: "Alpha", bet: "Beta", gam: "Gamma", del: "Delta", eps: "Epsilon", zet: "Zeta", eta: "Eta",
  tet: "Theta", iot: "Iota", kap: "Kappa", lam: "Lambda", mu: "Mu", nu: "Nu", ksi: "Xi",
  omi: "Omicron", pi: "Pi", rho: "Rho", sig: "Sigma", tau: "Tau", ups: "Upsilon", phi: "Phi",
  chi: "Chi", psi: "Psi", ome: "Omega",
};

/** "* del Cep" -> "Delta Cep", "V* CM Tau" -> "CM Tau", "NAME Betelgeuse" -> "Betelgeuse". */
export function prettifySimbadId(id: string): string {
  const stripped = id.replace(/^(NAME|V\*|\*\*|\*)\s+/, "").replace(/\s+/g, " ").trim();
  const [first, ...rest] = stripped.split(" ");
  const greek = GREEK[first.replace(/\d+$/, "")];
  return greek ? [greek + first.slice(first.replace(/\d+$/, "").length), ...rest].join(" ") : stripped;
}

function pickDisplayName(mainId: string, ids: string[]): string {
  const named = ids.find((id) => id.startsWith("NAME "));
  return prettifySimbadId(named ?? mainId);
}

/** Medians are robust to the wide spread of literature Teff values SIMBAD aggregates. */
function median(values: number[]) {
  if (!values.length) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function parseSimbad(raw: SimbadRaw): SimbadParsed {
  const basic = tapRecords(raw.basic)[0];
  if (!basic) throw new CatalogError(`SIMBAD has no basic data for ${raw.mainId}`, "simbad", false);
  const ids = tapRecords(raw.ids)
    .map((r) => str(r.id))
    .filter((v): v is string => !!v);
  const teffs = tapRecords(raw.teff)
    .map((r) => num(r.teff))
    .filter((v): v is number => v !== undefined && v > 0);
  const vmag = num(tapRecords(raw.flux).find((r) => r.filter === "V")?.flux);
  const mainId = str(basic.main_id) ?? raw.mainId;

  return {
    oid: num(basic.oid) ?? 0,
    mainId,
    displayName: pickDisplayName(mainId, ids),
    ra: num(basic.ra) ?? 0,
    dec: num(basic.dec) ?? 0,
    otype: str(basic.otype) ?? "?",
    parallaxMas: num(basic.plx_value),
    spectralType: str(basic.sp_type),
    teffK: median(teffs),
    vmag,
    ids,
    gaiaDr3: ids.find((id) => id.startsWith("Gaia DR3 "))?.slice("Gaia DR3 ".length),
    pulsarNames: ids.filter((id) => /^PSR [JB]/.test(id)).map((id) => id.slice(4).trim()),
  };
}

/** SIMBAD object types -> our coarse classification (refined later by VSX/ATNF presence). */
export function classifyOtype(rawOtype: string): ObjectType {
  // Candidate types carry a "?" ("LP?" = long-period variable candidate): treat as the type itself.
  const otype = rawOtype.endsWith("?") ? `${rawOtype.slice(0, -1)}*`.replace(/\*\*$/, "*") : rawOtype;
  if (otype === "Psr") return "pulsar";
  if (/^(\*\*|SB\*|EB\*|Al\*|bL\*|WU\*|El\*|Cl\*|OpC|GlC|As\*)$/.test(otype)) return "star_system";
  if (/^(V\*|Pu\*|cC\*|dS\*|RR\*|Mi\*|LP\*|sr\*|RV\*|Ce\*|WV\*|Ir\*|Er\*|Ro\*|BY\*|RS\*|gD\*|SX\*|bC\*|Or\*|No\*|CV\*|DN\*)$/.test(otype))
    return "variable_star";
  if (otype.includes("*") || /^(PM\*|HB\*|WD\*|BS\*|RG\*|s\*r|s\*b|s\*y|C\*|S\*|HS\*|Y\*O|MS\*)$/.test(otype)) return "star";
  return "other";
}

interface SesameHit {
  mainId: string;
  otype: string;
  oid?: number;
}

export function parseSesame(xml: string): SesameHit | null {
  const resolver = xml.match(/<Resolver[\s\S]*?<\/Resolver>/)?.[0];
  if (!resolver) return null;
  const tag = (name: string) => resolver.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim();
  const mainId = tag("oname");
  if (!mainId) return null;
  const oid = Number(tag("oid"));
  return { mainId, otype: tag("otype") ?? "?", oid: Number.isFinite(oid) ? oid : undefined };
}

export async function resolveName(query: string): Promise<SesameHit | null> {
  const xml = await requestText(`${SESAME}?${encodeURIComponent(query)}`, { source: "simbad" });
  return parseSesame(xml);
}

export const simbad: SourceAdapter<SimbadRaw> = {
  id: "simbad",

  async search(query) {
    const hit = await resolveName(query);
    if (!hit) return [];
    const names = hit.oid
      ? await tapQuery(TAP, `SELECT id FROM ident WHERE oidref = ${hit.oid} AND id LIKE 'NAME %'`, "simbad")
      : { columns: ["id"], rows: [] };
    const name = pickDisplayName(
      hit.mainId,
      tapRecords(names).map((r) => String(r.id)),
    );
    const candidate: Candidate = {
      source: "simbad",
      ref: `simbad:${hit.mainId}`,
      name,
      slug: slugify(name),
      type: classifyOtype(hit.otype),
      hint: `SIMBAD · ${hit.mainId} · ${hit.otype}`,
    };
    return [candidate];
  },

  async fetch(mainId) {
    const basic = await tapQuery(
      TAP,
      `SELECT b.oid, b.main_id, b.ra, b.dec, b.otype, b.plx_value, b.sp_type
       FROM basic AS b JOIN ident AS i ON i.oidref = b.oid
       WHERE i.id = ${adqlString(mainId)}`,
      "simbad",
    );
    const oid = num(tapRecords(basic)[0]?.oid);
    if (oid === undefined) throw new CatalogError(`SIMBAD does not know ${mainId}`, "simbad", false);

    const [ids, teff, flux] = await Promise.all([
      tapQuery(
        TAP,
        `SELECT id FROM ident WHERE oidref = ${oid} AND (id LIKE 'NAME %' OR id LIKE 'Gaia DR3 %' OR id LIKE 'PSR %' OR id LIKE 'HD %' OR id LIKE 'HIP %')`,
        "simbad",
      ),
      tapQuery(TAP, `SELECT TOP 50 teff FROM mesFe_h WHERE oidref = ${oid} AND teff > 0`, "simbad"),
      tapQuery(TAP, `SELECT filter, flux FROM flux WHERE oidref = ${oid} AND filter = 'V'`, "simbad"),
    ]);
    return { mainId, basic, ids, teff, flux };
  },
};

export function simbadUrl(mainId: string) {
  return `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${encodeURIComponent(mainId)}`;
}
