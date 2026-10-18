import { GENRES, type GenreId, type LayerName } from "./genres";

/**
 * The listener's adjustments to a genre, on top of the preset. Everything is relative, so
 * each object still sounds like itself: the neutral mix reproduces the preset exactly.
 */
export interface GenreMix {
  /** Tempo change as a fraction (−0.25 … +0.25). */
  tempo: number;
  /** Notes per time period, as a multiplier (0.25 = sparse … 2.5 = busy). */
  density: number;
  /** −1 (low) … +1 (high): how often melodic voices climb into the upper octaves. */
  register: number;
  /** Reverb amount, as a multiplier (0 = dry … 2). */
  space: number;
  /** Guitar distortion, as a multiplier (0 = clean … 2). Only genres with a guitar use it. */
  drive: number;
  /** Per-layer level offset in dB from the preset, and mute. */
  layers: Record<LayerName, { db: number; on: boolean }>;
}

export const LAYER_NAMES: LayerName[] = ["lead", "pad", "bass", "guitar", "drums", "texture"];

export const MIX_RANGES = {
  tempo: [-0.25, 0.25, 0.01],
  density: [0.25, 2.5, 0.05],
  register: [-1, 1, 0.05],
  space: [0, 2, 0.05],
  drive: [0, 2, 0.05],
  db: [-18, 9, 1],
} as const satisfies Record<string, readonly [number, number, number]>;

export const neutralMix = (): GenreMix => ({
  tempo: 0,
  density: 1,
  register: 0,
  space: 1,
  drive: 1,
  layers: Object.fromEntries(LAYER_NAMES.map((n) => [n, { db: 0, on: true }])) as GenreMix["layers"],
});

export const NEUTRAL_MIX: GenreMix = neutralMix();

export type MixSettings = Record<GenreId, GenreMix>;
export const defaultMixes = (): MixSettings =>
  Object.fromEntries(Object.keys(GENRES).map((g) => [g, neutralMix()])) as MixSettings;

const num = (x: unknown, [lo, hi]: readonly [number, number, number], d: number) =>
  typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;

export function sanitizeMix(v: unknown): GenreMix {
  const m = (v && typeof v === "object" ? v : {}) as Partial<GenreMix>;
  const layers = (m.layers && typeof m.layers === "object" ? m.layers : {}) as Partial<GenreMix["layers"]>;
  return {
    tempo: num(m.tempo, MIX_RANGES.tempo, 0),
    density: num(m.density, MIX_RANGES.density, 1),
    register: num(m.register, MIX_RANGES.register, 0),
    space: num(m.space, MIX_RANGES.space, 1),
    drive: num(m.drive, MIX_RANGES.drive, 1),
    layers: Object.fromEntries(
      LAYER_NAMES.map((n) => {
        const l = (layers[n] ?? {}) as Partial<GenreMix["layers"][LayerName]>;
        return [n, { db: num(l.db, MIX_RANGES.db, 0), on: typeof l.on === "boolean" ? l.on : true }];
      }),
    ) as GenreMix["layers"],
  };
}

export function sanitizeMixes(v: unknown): MixSettings {
  const all = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return Object.fromEntries(Object.keys(GENRES).map((g) => [g, sanitizeMix(all[g])])) as MixSettings;
}

export const isNeutral = (m: GenreMix) => JSON.stringify(m) === JSON.stringify(NEUTRAL_MIX);

/** The tempo a mix plays an object at. */
export const mixedBpm = (bpm: number, m: GenreMix) => Math.round(bpm * (1 + m.tempo) * 10) / 10;

/** Layers a genre actually has (the rest are not shown or touched). */
export const genreLayers = (genre: GenreId) => LAYER_NAMES.filter((n) => GENRES[genre].layers[n].enabled);
