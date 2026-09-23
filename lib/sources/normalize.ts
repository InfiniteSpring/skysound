import { atnfUrl, parseAtnf } from "./atnf";
import { parseVsx, vsxAmplitude, vsxUrl } from "./aavso";
import { parseGaia } from "./gaia";
import { jplUrl, parseJpl } from "./jpl";
import { modelLightCurve, pulsarProfile } from "./lightcurve";
import { classifyOtype, parseSimbad, simbadUrl } from "./simbad";
import {
  SpaceObjectSchema,
  type LightCurve,
  type ObjectType,
  type Params,
  type Position,
  type RawBundle,
  type Sources,
  type SpaceObject,
} from "./types";

export const LY_PER_PC = 3.261_563_777;
export const LY_PER_AU = 1.581_250_74e-5;
export const SUN_LUMINOSITY_W = 3.828e26;

export interface NormalizeOptions {
  slug: string;
  name?: string;
  description?: string;
}

export const TYPE_LABELS_RU: Record<ObjectType, string> = {
  star: "звезда",
  planet: "планета",
  pulsar: "пульсар",
  variable_star: "переменная звезда",
  star_system: "звёздная система",
  moon: "спутник",
  small_body: "малое тело",
  other: "объект",
};

const round = (v: number | undefined, digits = 4) =>
  v === undefined ? undefined : Number(v.toPrecision(digits));

function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** Type of a Horizons major body from its SPK id: x99 are planets, the rest of 1xx–9xx are moons. */
function jplType(command: string, name: string): ObjectType {
  if (command === "10" || name === "Sun") return "star";
  if (command.startsWith("DES=")) return "small_body";
  const id = Number(command);
  if (id === 999) return "small_body";
  if (id % 100 === 99) return "planet";
  if (id > 100 && id < 1000) return "moon";
  return "other";
}

function fromJpl(bundle: Required<Pick<RawBundle, "jpl">>, opts: NormalizeOptions) {
  const p = parseJpl(bundle.jpl);
  if (p.ra === undefined || p.dec === undefined) throw new Error("Horizons ephemeris has no RA/Dec");
  const type = jplType(bundle.jpl.command, p.name);
  const params: Params = compact({
    period_s: round(p.rotationPeriodS, 6),
    rotation_period_s: round(p.rotationPeriodS, 6),
    orbital_period_days: type === "star" ? undefined : round(p.orbitalPeriodDays, 7),
    temperature_k: round(p.temperatureK),
    luminosity: p.luminosityW ? round(p.luminosityW / SUN_LUMINOSITY_W) : undefined,
    distance_ly: round(p.deltaAu !== undefined ? p.deltaAu * LY_PER_AU : undefined),
  });
  return {
    canonicalKey: `jpl:${bundle.jpl.command}`,
    name: opts.name ?? p.name,
    type,
    position: { ra_deg: p.ra, dec_deg: p.dec, epoch: bundle.jpl.date },
    params,
    lightCurve: null as LightCurve | null,
    sources: { jpl: { id: bundle.jpl.command, url: jplUrl(bundle.jpl.command) } } as Sources,
  };
}

function fromCatalogs(bundle: RawBundle, opts: NormalizeOptions) {
  const s = bundle.simbad ? parseSimbad(bundle.simbad) : undefined;
  const psr = bundle.atnf ? parseAtnf(bundle.atnf)[0] : undefined;
  const g = bundle.gaia ? parseGaia(bundle.gaia) : undefined;
  // Accept only a close VSX match with a usable period: cone searches can catch neighbours.
  const v = bundle.vsx
    ? parseVsx(bundle.vsx).find((x) => (x.separationArcsec ?? 0) < 15 && x.periodDays)
    : undefined;

  if (!s && !psr && !g) throw new Error("Bundle has no primary catalog data");

  let type: ObjectType = s ? classifyOtype(s.otype) : psr ? "pulsar" : "star";
  if (psr) type = "pulsar";
  else if (v) type = "variable_star";

  const distanceLy =
    psr?.distanceKpc !== undefined
      ? psr.distanceKpc * 1000 * LY_PER_PC
      : s?.parallaxMas && s.parallaxMas > 0
        ? (1000 / s.parallaxMas) * LY_PER_PC
        : g?.distancePc
          ? g.distancePc * LY_PER_PC
          : undefined;

  const periodS = psr?.periodS ?? (v?.periodDays ? v.periodDays * 86400 : undefined);

  const params: Params = compact({
    period_s: round(periodS, 8),
    temperature_k: round(s?.teffK ?? g?.teffK),
    luminosity: round(g?.luminositySun),
    distance_ly: round(distanceLy),
    magnitude_v: s?.vmag,
    amplitude_mag: v ? round(vsxAmplitude(v), 3) : undefined,
    spectral_type: s?.spectralType,
    variability_type: v?.type,
  });

  const lightCurve = psr
    ? pulsarProfile(psr.periodS, (psr.edotErgS ?? 0) > 1e38)
    : v?.periodDays
      ? modelLightCurve(v.type, v.periodDays * 86400)
      : null;

  const position: Position = {
    ra_deg: s?.ra ?? psr?.ra ?? g?.ra ?? 0,
    dec_deg: s?.dec ?? psr?.dec ?? g?.dec ?? 0,
  };

  const sources: Sources = compact({
    simbad: s ? { id: s.mainId, url: simbadUrl(s.mainId) } : undefined,
    atnf: psr ? { id: psr.jname, url: atnfUrl(psr.jname) } : undefined,
    gaia: g ? { id: g.sourceId } : undefined,
    vsx: v ? { id: v.name, url: vsxUrl(v.name) } : undefined,
  });

  return {
    canonicalKey: s ? `simbad:${s.mainId}` : psr ? `atnf:${psr.jname}` : `gaia:${g!.sourceId}`,
    name: opts.name ?? s?.displayName ?? (psr ? `PSR ${psr.jname}` : `Gaia DR3 ${g!.sourceId}`),
    type,
    position,
    params,
    lightCurve,
    sources,
  };
}

const fmt = (v: number, digits = 3) =>
  v >= 1e5 || v < 1e-3 ? v.toExponential(2).replace("e+", "·10^") : String(Number(v.toPrecision(digits)));

export function formatPeriod(seconds: number): string {
  if (seconds < 1) return `${fmt(seconds * 1000)} мс`;
  if (seconds < 120) return `${fmt(seconds)} с`;
  if (seconds < 7200) return `${fmt(seconds / 60)} мин`;
  if (seconds < 172_800) return `${fmt(seconds / 3600)} ч`;
  if (seconds < 3 * 365.25 * 86400) return `${fmt(seconds / 86400)} сут`;
  return `${fmt(seconds / (365.25 * 86400))} лет`;
}

export function formatDistance(ly: number): string {
  if (ly < 0.01) return `${fmt(ly / LY_PER_AU)} а. е.`;
  return `${fmt(ly)} св. лет`;
}

export function describe(o: Pick<SpaceObject, "name" | "type" | "params">): string {
  const p = o.params;
  const parts = [`${o.name} — ${TYPE_LABELS_RU[o.type]}`];
  if (p.spectral_type) parts[0] += ` спектрального класса ${p.spectral_type}`;
  const facts: string[] = [];
  if (p.distance_ly) facts.push(`находится на расстоянии ${formatDistance(p.distance_ly)}`);
  if (p.temperature_k) facts.push(`температура около ${Math.round(p.temperature_k)} K`);
  if (o.type === "pulsar" && p.period_s) facts.push(`вращается с периодом ${formatPeriod(p.period_s)}`);
  else if (o.type === "variable_star" && p.period_s)
    facts.push(`меняет блеск с периодом ${formatPeriod(p.period_s)}${p.amplitude_mag ? ` на ${p.amplitude_mag} зв. вел.` : ""}`);
  if (p.orbital_period_days) facts.push(`оборот вокруг Солнца занимает ${formatPeriod(p.orbital_period_days * 86400)}`);
  return `${parts[0]}${facts.length ? ", " + facts.join(", ") : ""}. Музыка строится из этих параметров.`;
}

/** Pure: raw catalog responses -> validated SpaceObject. Used on fetch and when rebuilding from `raw`. */
export function normalize(bundle: RawBundle, opts: NormalizeOptions): SpaceObject {
  const base = bundle.jpl ? fromJpl({ jpl: bundle.jpl }, opts) : fromCatalogs(bundle, opts);
  return SpaceObjectSchema.parse({
    ...base,
    slug: opts.slug,
    description: opts.description ?? describe(base),
  });
}
