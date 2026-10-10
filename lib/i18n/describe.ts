import { LY_PER_AU } from "../sources/normalize";
import type { LightCurve, SpaceObject } from "../sources/types";
import type { Lang } from "./config";
import { getDictionary } from "./dictionaries";

const fmt = (v: number, digits = 3) =>
  v >= 1e5 || v < 1e-3 ? v.toExponential(2).replace("e+", "·10^") : String(Number(v.toPrecision(digits)));

export function formatPeriod(seconds: number, lang: Lang): string {
  const u = getDictionary(lang).units;
  if (seconds < 1) return `${fmt(seconds * 1000)} ${u.ms}`;
  if (seconds < 120) return `${fmt(seconds)} ${u.s}`;
  if (seconds < 7200) return `${fmt(seconds / 60)} ${u.min}`;
  if (seconds < 172_800) return `${fmt(seconds / 3600)} ${u.h}`;
  if (seconds < 3 * 365.25 * 86400) return `${fmt(seconds / 86400)} ${u.d}`;
  return `${fmt(seconds / (365.25 * 86400))} ${u.yr}`;
}

export function formatDistance(ly: number, lang: Lang): string {
  const u = getDictionary(lang).units;
  if (ly < 0.01) return `${fmt(ly / LY_PER_AU)} ${u.au}`;
  return `${fmt(ly)} ${u.ly}`;
}

export function formatMass(msun: number, lang: Lang): string {
  return `${fmt(msun)} ${getDictionary(lang).units.msun}`;
}

/** Generated description for objects without a curated text, using each language's templates. */
export function describe(o: Pick<SpaceObject, "type" | "params">, name: string, lang: Lang): string {
  const t = getDictionary(lang);
  const d = t.describe;
  const p = o.params;
  const facts: string[] = [];
  if (p.distance_ly) facts.push(d.distance(formatDistance(p.distance_ly, lang)));
  if (p.temperature_k) facts.push(d.temperature(Math.round(p.temperature_k)));
  if (o.type === "pulsar" && p.period_s) facts.push(d.spin(formatPeriod(p.period_s, lang)));
  else if (o.type === "variable_star" && p.period_s) facts.push(d.variability(formatPeriod(p.period_s, lang), p.amplitude_mag));
  if (p.orbital_period_days) facts.push(d.orbit(formatPeriod(p.orbital_period_days * 86400, lang)));
  return d.join(d.lead(name, t.types[o.type], p.spectral_type), facts);
}

/** Caption under the facts: light curves are shape models, and we say so. */
export function lightCurveNote(lc: LightCurve, variability: string | undefined, lang: Lang): string {
  return getDictionary(lang).curve[lc.shape ?? "sine"](variability ? ` (${variability})` : "");
}
