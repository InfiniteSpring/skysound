import type { ScaleName } from "../theory";

export type LayerName = "drums" | "bass" | "pad" | "lead" | "texture";
export type GenreId = "ambient" | "lofi";

export interface LayerConfig {
  enabled: boolean;
  /** Mix level in dB; everything sits well below 0 so the master limiter rarely works. */
  gainDb: number;
}

export interface GenrePreset {
  id: GenreId;
  label: string;
  bpmRange: [number, number];
  /** Ordered from darkest to brightest: hotter objects pick further right. */
  scales: ScaleName[];
  /** Scale degrees (0 = tonic). */
  chordProgressions: number[][];
  instruments: {
    pad: "drone" | "keys";
    bass: "sub" | "round";
    lead: "glass" | "keys";
    texture: "shimmer" | "vinyl";
    drums: "none" | "boombap";
  };
  layers: Record<LayerName, LayerConfig>;
  rules: {
    /** 0..1, base probability of a lead note per eighth. */
    noteDensity: number;
    /** 0 = straight, 0.33 ≈ triplet swing on eighths. */
    swing: number;
    /** Bars per phrase; variation happens at phrase boundaries. */
    phraseLength: number;
    /** Bars each chord lasts. */
    chordBars: number;
    /** Notes per chord (3 = triads, 4 = sevenths). */
    chordSize: number;
  };
}

export const ambient: GenrePreset = {
  id: "ambient",
  label: "Ambient",
  bpmRange: [56, 84],
  scales: ["aeolian", "dorian", "mixolydian", "major", "lydian"],
  chordProgressions: [
    [0, 5, 3, 4],
    [0, 3, 0, 4],
    [0, 2, 5, 3],
    [0, 4, 5, 3],
    [0, 3, 5, 4],
  ],
  instruments: { pad: "drone", bass: "sub", lead: "glass", texture: "shimmer", drums: "none" },
  layers: {
    drums: { enabled: false, gainDb: -18 },
    bass: { enabled: true, gainDb: -16 },
    pad: { enabled: true, gainDb: -14 },
    lead: { enabled: true, gainDb: -19 },
    texture: { enabled: true, gainDb: -24 },
  },
  rules: { noteDensity: 0.18, swing: 0, phraseLength: 8, chordBars: 2, chordSize: 4 },
};

export const lofi: GenrePreset = {
  id: "lofi",
  label: "Lo-fi",
  bpmRange: [68, 88],
  scales: ["aeolian", "dorian", "mixolydian", "major", "lydian"],
  chordProgressions: [
    [1, 4, 0, 0],
    [0, 5, 1, 4],
    [3, 2, 1, 0],
    [0, 3, 1, 4],
    [5, 3, 0, 4],
  ],
  instruments: { pad: "keys", bass: "round", lead: "keys", texture: "vinyl", drums: "boombap" },
  layers: {
    drums: { enabled: true, gainDb: -13 },
    bass: { enabled: true, gainDb: -14 },
    pad: { enabled: true, gainDb: -17 },
    lead: { enabled: true, gainDb: -20 },
    texture: { enabled: true, gainDb: -28 },
  },
  rules: { noteDensity: 0.3, swing: 0.28, phraseLength: 4, chordBars: 1, chordSize: 4 },
};

export const GENRES: Record<GenreId, GenrePreset> = { ambient, lofi };
export const GENRE_LIST = Object.values(GENRES);
