import type { LightCurve, ObjectType, Params, SpaceObject } from "../sources/types";
import type { GenrePreset } from "./genres";
import { hashString } from "./random";
import type { ScaleName } from "./theory";

export type Timbre = "dark" | "warm" | "glass" | "bell";

export interface MusicParams {
  seed: number;
  bpm: number;
  /** Octaves the source period was folded by to reach the BPM range (+ faster, − slower). */
  tempoOctaves: number;
  rootMidi: number;
  scale: ScaleName;
  progression: number[];
  /** 0 (cold, dark) .. 1 (hot, bright), from temperature. */
  brightness: number;
  cutoffHz: number;
  timbre: Timbre;
  /** 0 (near) .. 1 (far), from distance. */
  depth: number;
  reverbDecay: number;
  reverbWet: number;
  delayWet: number;
  delayFeedback: number;
  dynamics: { curve: number[]; bars: number; depth: number; kind: LightCurve["kind"] | "default" };
  /** Rhythmic texture: pulsars tick, others shimmer. */
  pulse: { enabled: boolean; subdivision: 4 | 8 | 16; accents: number[] };
  density: number;
}

/** Parameter defaults by object type, used when catalogs do not know a value. */
export const TYPE_DEFAULTS: Record<ObjectType, Required<Pick<Params, "temperature_k" | "distance_ly">> & { period_s: number }> = {
  star: { temperature_k: 5800, distance_ly: 100, period_s: 25 * 86400 },
  planet: { temperature_k: 150, distance_ly: 5e-5, period_s: 365.25 * 86400 },
  pulsar: { temperature_k: 1e6, distance_ly: 3000, period_s: 0.5 },
  variable_star: { temperature_k: 5000, distance_ly: 1000, period_s: 5 * 86400 },
  star_system: { temperature_k: 7000, distance_ly: 300, period_s: 3 * 86400 },
  moon: { temperature_k: 100, distance_ly: 3e-5, period_s: 27 * 86400 },
  small_body: { temperature_k: 150, distance_ly: 3e-5, period_s: 4 * 365.25 * 86400 },
  // Sgr A* flares quasi-periodically on ~20-minute timescales.
  black_hole: { temperature_k: 1500, distance_ly: 26_000, period_s: 20 * 60 },
  other: { temperature_k: 5000, distance_ly: 1000, period_s: 86400 },
};

const EARTH_YEAR_S = 365.256 * 86400;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Fold a period into the genre's BPM range by powers of two (octave-equivalence for rhythm).
 * A 33 ms pulsar (1797 BPM) and an 11-year orbit both land inside [lo, hi].
 * Genre ranges are narrower than an octave, so the position within the octave is mapped
 * logarithmically onto [lo, hi] instead of clamping — distinct periods keep distinct tempi.
 */
export function periodToBpm(periodS: number, [lo, hi]: [number, number]) {
  const raw = 60 / periodS;
  const log = Math.log2(raw / lo);
  const octaves = -Math.floor(log);
  const frac = log - Math.floor(log); // 0..1 position inside the octave [lo, 2lo)
  const bpm = lo * (hi / lo) ** frac;
  return { bpm: Math.round(clamp(bpm, lo, hi) * 10) / 10, octaves };
}

/** The period that drives rhythm: spin/pulsation for compact or variable objects, orbit for bodies. */
export function rhythmPeriod(o: Pick<SpaceObject, "type" | "params">) {
  const p = o.params;
  if (o.type === "pulsar" || o.type === "variable_star" || o.type === "star_system" || o.type === "black_hole") {
    return p.period_s ?? TYPE_DEFAULTS[o.type].period_s;
  }
  if (p.orbital_period_days) return p.orbital_period_days * 86400;
  return p.period_s ?? p.rotation_period_s ?? TYPE_DEFAULTS[o.type].period_s;
}

/** Simple ratios a period relationship can be "heard" as, with the progression they select. */
const RATIOS = [1, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 8 / 5, 5 / 3, 16 / 9, 15 / 8];

/**
 * Harmony from period ratios. For solar-system bodies, orbit vs Earth's year (Jupiter ≈ 11.86 →
 * fold → close to 3:2); for others, the characteristic period vs rotation or 1 day.
 * Returns the root transposition (semitones) and a progression index.
 */
export function harmonyFromRatio(o: Pick<SpaceObject, "type" | "params">) {
  const p = o.params;
  const primary = rhythmPeriod(o);
  const reference = p.orbital_period_days
    ? EARTH_YEAR_S
    : p.rotation_period_s && p.rotation_period_s !== primary
      ? p.rotation_period_s
      : 86400;
  const ratio = primary / reference;
  const octaveFrac = ((Math.log2(ratio) % 1) + 1) % 1; // fold into one octave [1, 2)
  const folded = 2 ** octaveFrac;
  let best = 0;
  RATIOS.forEach((r, i) => {
    if (Math.abs(Math.log2(folded / r)) < Math.abs(Math.log2(folded / RATIOS[best]))) best = i;
  });
  const semitones = Math.round(12 * Math.log2(RATIOS[best]));
  return { semitones, progressionIndex: best, ratio };
}

export function brightnessFromTemperature(t: number) {
  // log scale: 50 K (outer planets) -> 0, 30 000 K (hot stars) -> 1; pulsars saturate.
  return clamp(Math.log10(t / 50) / Math.log10(30000 / 50), 0, 1);
}

export function depthFromDistance(ly: number) {
  // 1e-5 ly (inner solar system) -> 0, 1e4 ly (galactic pulsars) -> 1.
  return clamp((Math.log10(ly) + 5) / 9, 0, 1);
}

function timbreFor(brightness: number, type: ObjectType): Timbre {
  if (type === "pulsar") return "bell";
  if (type === "black_hole") return "dark";
  if (brightness < 0.35) return "dark";
  if (brightness < 0.72) return "warm";
  return "glass";
}

/** Resample a light curve to `n` points (linear interpolation, periodic). */
export function resample(samples: number[], n: number) {
  return Array.from({ length: n }, (_, i) => {
    const x = (i / n) * samples.length;
    const i0 = Math.floor(x) % samples.length;
    const i1 = (i0 + 1) % samples.length;
    const f = x - Math.floor(x);
    return samples[i0] * (1 - f) + samples[i1] * f;
  });
}

function dynamicsFor(o: Pick<SpaceObject, "type" | "params" | "lightCurve">, bpm: number) {
  const barS = (60 / bpm) * 4;
  const lc = o.lightCurve;
  const period = lc?.period_s ?? rhythmPeriod(o);
  // Fold the brightness cycle into 4..32 bars so it is long enough to feel like breathing.
  let bars = period / barS;
  while (bars > 32) bars /= 2;
  while (bars < 4) bars *= 2;
  bars = Math.round(bars);
  if (lc) {
    const depth = clamp((o.params.amplitude_mag ?? 0.6) / 2, 0.15, 0.6);
    return { curve: resample(lc.samples, 64), bars, depth, kind: lc.kind };
  }
  const curve = Array.from({ length: 64 }, (_, i) => 0.5 + 0.5 * Math.sin((2 * Math.PI * i) / 64));
  return { curve, bars, depth: 0.15, kind: "default" as const };
}

const DENSITY_BY_TYPE: Partial<Record<ObjectType, number>> = {
  pulsar: 1.3,
  planet: 0.8,
  small_body: 0.7,
  moon: 0.7,
  black_hole: 0.5,
};

export function mapToMusic(o: Pick<SpaceObject, "slug" | "type" | "params" | "lightCurve">, genre: GenrePreset): MusicParams {
  const defaults = TYPE_DEFAULTS[o.type];
  const temperature = o.params.temperature_k ?? defaults.temperature_k;
  const distance = o.params.distance_ly ?? defaults.distance_ly;

  const { bpm, octaves } = periodToBpm(rhythmPeriod(o), genre.bpmRange);
  const { semitones, progressionIndex } = harmonyFromRatio(o);

  // Black holes sound dark whatever their companion star's temperature.
  const brightness = o.type === "black_hole" ? Math.min(0.25, brightnessFromTemperature(temperature)) : brightnessFromTemperature(temperature);
  const depth = depthFromDistance(distance);
  const scale = genre.scales[Math.min(genre.scales.length - 1, Math.floor(brightness * genre.scales.length))];

  // Root around A2 (45); keep within E2..D#3 so bass and pads stay in a comfortable register.
  let rootMidi = 45 + semitones;
  if (rootMidi > 51) rootMidi -= 12;

  const seed = hashString(o.slug);
  return {
    seed,
    bpm,
    tempoOctaves: octaves,
    rootMidi,
    scale,
    progression: genre.chordProgressions[progressionIndex % genre.chordProgressions.length],
    brightness,
    cutoffHz: Math.round(350 * 2 ** (brightness * 4.2)),
    timbre: timbreFor(brightness, o.type),
    depth,
    reverbDecay: Math.round((2.5 + depth * 9.5) * 10) / 10,
    reverbWet: Math.round((0.2 + depth * 0.4) * 100) / 100,
    delayWet: Math.round((0.08 + depth * 0.17) * 100) / 100,
    delayFeedback: Math.round((0.2 + depth * 0.3) * 100) / 100,
    dynamics: dynamicsFor(o, bpm),
    pulse: {
      enabled: o.type === "pulsar",
      subdivision: o.type === "pulsar" ? (octaves < -4 ? 16 : 8) : 4,
      accents: o.lightCurve ? resample(o.lightCurve.samples, 16) : Array(16).fill(0.5),
    },
    density: clamp(genre.rules.noteDensity * (DENSITY_BY_TYPE[o.type] ?? 1), 0.05, 0.6),
  };
}
