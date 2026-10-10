import type { GenrePreset } from "./genres";
import type { MusicParams } from "./mapping";
import { barSeed, rng } from "./random";
import { chordMidi, degreeToMidi, voiceLead } from "./theory";

/** Times and durations are in beats (quarter notes) from the start of the bar. */
export interface NoteEvent {
  time: number;
  midi: number;
  dur: number;
  vel: number;
}
export interface HitEvent {
  time: number;
  vel: number;
}

/** How the guitar sounds in a phrase; the engine sets gain, swell and reverb from it. */
export type GuitarStyle = "rest" | "clean" | "shimmer" | "crunch" | "wall";
export interface GuitarTone {
  style: GuitarStyle;
  /** Distortion amount 0..1 (0 = the clean guitar plays). */
  drive: number;
  /** Reverb send 0..1. */
  space: number;
  /** Volume-swell attack instead of a pick attack. */
  swell: boolean;
}

export interface BarPlan {
  bar: number;
  chordDegree: number;
  chord: number[];
  pad: NoteEvent[];
  bass: NoteEvent[];
  lead: NoteEvent[];
  texture: NoteEvent[];
  /** Distorted guitar (ambient metal only). */
  guitar: NoteEvent[];
  /** Clean guitar arpeggios (ambient metal only). */
  clean: NoteEvent[];
  guitarTone: GuitarTone | null;
  drums: { kick: HitEvent[]; snare: HitEvent[]; hat: HitEvent[]; crash: HitEvent[] };
  /** 0..1 brightness-curve value at each beat (drives volume, cutoff, reverb). */
  dynamics: number[];
}

/** State carried between bars for voice leading and melodic continuity. */
export interface ComposerState {
  voicing: number[] | null;
  leadDegree: number;
  progression: number[];
}

export const initialState = (p: MusicParams): ComposerState => ({ voicing: null, leadDegree: 7, progression: p.progression });

const BEATS = 4;

function swingTime(t: number, swing: number) {
  // Delay off-beat eighths: 0.5 -> 0.5 + swing/2.
  const frac = t % 1;
  return Math.abs(frac - 0.5) < 1e-6 ? t + swing / 2 : t;
}

/**
 * Slow variation: each phrase picks its own energy and whether the lead rests; every 4
 * phrases the progression may rotate to another one from the preset.
 */
function phraseShape(p: MusicParams, genre: GenrePreset, bar: number) {
  const phrase = Math.floor(bar / genre.rules.phraseLength);
  const r = rng(barSeed(p.seed, phrase, 1));
  return {
    phrase,
    energy: 0.6 + 0.4 * Math.sin(phrase * 0.9 + (p.seed % 7)) * 0.5 + r.range(-0.1, 0.1),
    leadRests: phrase % 4 === 0 ? false : r.chance(0.25),
    leadOctave: r.chance(0.3) ? 1 : 0,
    rotate: phrase > 0 && phrase % 4 === 0 && r.chance(0.6),
    padRestrike: r.chance(0.5),
  };
}

export function composeBar(p: MusicParams, genre: GenrePreset, bar: number, state: ComposerState): BarPlan {
  const r = rng(barSeed(p.seed, bar));
  const shape = phraseShape(p, genre, bar);
  const { chordBars, chordSize, phraseLength, swing } = genre.rules;

  if (shape.rotate && bar % phraseLength === 0) {
    const options = genre.chordProgressions.filter((x) => x !== state.progression);
    state.progression = rng(barSeed(p.seed, shape.phrase, 2)).pick(options.length ? options : genre.chordProgressions);
  }

  const chordIndex = Math.floor(bar / chordBars) % state.progression.length;
  const chordDegree = state.progression[chordIndex];
  const chordStart = bar % chordBars === 0;
  const chord = chordMidi(p.rootMidi, p.scale, chordDegree, chordSize);

  const plan: BarPlan = {
    bar,
    chordDegree,
    chord,
    pad: [],
    bass: [],
    lead: [],
    texture: [],
    guitar: [],
    clean: [],
    guitarTone: null,
    drums: { kick: [], snare: [], hat: [], crash: [] },
    dynamics: [],
  };

  // Dynamics: sample the folded light curve at each beat.
  const { curve, bars } = p.dynamics;
  for (let b = 0; b < BEATS; b++) {
    const phase = (((bar % bars) * BEATS + b) / (bars * BEATS)) % 1;
    plan.dynamics.push(curve[Math.floor(phase * curve.length) % curve.length]);
  }

  // Pad
  const [lo, hi] = genre.id === "lofi" ? [55, 74] : genre.id === "metal" ? [48, 66] : [52, 72];
  const voicing = voiceLead(chord, state.voicing, lo, hi);
  if (chordStart) {
    state.voicing = voicing;
    if (genre.instruments.pad !== "keys") {
      const dur = chordBars * BEATS + 0.5; // slight overlap for seamless changes
      voicing.forEach((midi, i) => plan.pad.push({ time: i * 0.12, midi, dur, vel: 0.32 + 0.08 * shape.energy }));
    } else {
      // Keys: soft strum on 1, optional re-strike on the "and" of 3.
      voicing.forEach((midi, i) => plan.pad.push({ time: i * 0.03, midi, dur: 2.4, vel: 0.42 }));
      if (shape.padRestrike) voicing.forEach((midi, i) => plan.pad.push({ time: swingTime(2.5, swing) + i * 0.03, midi, dur: 1.3, vel: 0.3 }));
    }
  }

  // Bass
  const bassRoot = degreeToMidi(p.rootMidi - 12, p.scale, chordDegree);
  const bass = bassRoot < 33 ? bassRoot + 12 : bassRoot;
  if (genre.instruments.bass !== "round") {
    const vel = genre.id === "metal" ? { rest: 0.3, clean: 0.35, shimmer: 0.3, crunch: 0.5, wall: 0.62 }[guitarStyle(p, shape.phrase)] : 0.55;
    if (chordStart) plan.bass.push({ time: 0, midi: bass, dur: chordBars * BEATS - 0.25, vel });
  } else {
    plan.bass.push({ time: 0, midi: bass, dur: 1.4, vel: 0.62 });
    const fifth = degreeToMidi(p.rootMidi - 12, p.scale, chordDegree + 4);
    const next = r.chance(0.5) ? fifth : bass + 12;
    plan.bass.push({ time: swingTime(2.5, swing), midi: next > 52 ? next - 12 : next, dur: 1, vel: 0.5 });
  }

  // Lead: a random walk over the scale, landing on chord tones on strong beats.
  if (!shape.leadRests) {
    const density = p.density * shape.energy;
    const chordDegrees = new Set([0, 2, 4].map((i) => (((chordDegree + i) % 7) + 7) % 7));
    for (let e = 0; e < BEATS * 2; e++) {
      const strong = e % 4 === 0;
      if (!r.chance(strong ? density * 1.4 : density)) continue;
      const step = r.pick([-2, -1, -1, 1, 1, 2, 0]);
      let degree = state.leadDegree + step;
      if (degree < 4 || degree > 13) degree = state.leadDegree - step;
      if (strong) {
        // Nudge to the nearest chord tone so downbeats are always consonant.
        for (const d of [0, 1, -1, 2, -2]) {
          if (chordDegrees.has((((degree + d) % 7) + 7) % 7)) {
            degree += d;
            break;
          }
        }
      }
      state.leadDegree = degree;
      const midi = degreeToMidi(p.rootMidi + 12 + shape.leadOctave * 12, p.scale, degree);
      const time = swingTime(e / 2, swing);
      const dur = genre.id === "lofi" ? r.pick([0.5, 0.75, 1]) : r.pick([1.5, 2, 3]);
      plan.lead.push({ time, midi, dur, vel: 0.35 + r.range(0, 0.2) });
    }
  }

  // Texture: pulsar ticks follow the pulse profile; otherwise sparse high shimmer on chord tones.
  if (p.pulse.enabled) {
    const n = p.pulse.subdivision;
    for (let i = 0; i < n; i++) {
      const accent = p.pulse.accents[Math.floor((i / n) * p.pulse.accents.length)];
      if (accent < 0.15 && !r.chance(0.35)) continue;
      plan.texture.push({ time: (i * BEATS) / n, midi: chord[i % chord.length] + 36, dur: 0.1, vel: 0.15 + 0.45 * accent });
    }
  } else if (genre.instruments.texture === "shimmer") {
    for (let b = 0; b < BEATS; b++) {
      if (r.chance(0.18 * shape.energy)) {
        plan.texture.push({ time: b + r.pick([0, 0.5]), midi: r.pick(chord) + 24, dur: 2, vel: 0.2 + r.range(0, 0.15) });
      }
    }
  }

  // Drums (boom-bap): kick 1 & "and of 3", snare 2 & 4, swung eighth hats with ghost notes.
  if (genre.instruments.drums === "boombap") {
    plan.drums.kick.push({ time: 0, vel: 0.9 });
    plan.drums.kick.push({ time: swingTime(2.5, swing), vel: 0.7 });
    if (r.chance(0.3)) plan.drums.kick.push({ time: swingTime(1.5, swing), vel: 0.45 });
    plan.drums.snare.push({ time: 1, vel: 0.75 }, { time: 3, vel: 0.8 });
    for (let e = 0; e < 8; e++) {
      if (e % 2 === 1 && r.chance(0.15)) continue;
      plan.drums.hat.push({ time: swingTime(e / 2, swing), vel: (e % 2 ? 0.25 : 0.4) + r.range(0, 0.1) });
    }
  }

  // Ambient metal: the guitar changes character per phrase (see guitarStyle) and the drums
  // follow it — silent under clean passages, a slow heavy pulse only under the walls.
  if (genre.instruments.guitar === "heavy") ambientMetal(p, plan, bar, chordDegree, chordStart, genre, shape.energy);

  // Drum voices are monophonic: Tone needs their hits in time order.
  for (const hits of Object.values(plan.drums)) hits.sort((a: HitEvent, b: HitEvent) => a.time - b.time);
  return plan;
}

const STYLES: GuitarStyle[] = ["clean", "clean", "shimmer", "crunch", "wall", "wall", "rest"];
const TONES: Record<GuitarStyle, Omit<GuitarTone, "style">> = {
  rest: { drive: 0, space: 0.5, swell: false },
  clean: { drive: 0, space: 0.55, swell: false },
  shimmer: { drive: 0, space: 0.95, swell: true },
  crunch: { drive: 0.35, space: 0.4, swell: false },
  wall: { drive: 0.9, space: 0.75, swell: true },
};

/**
 * Each phrase picks its own guitar character, never the same twice in a row. The piece
 * always opens clean, so the heaviness arrives rather than starts.
 */
export function guitarStyle(p: MusicParams, phrase: number): GuitarStyle {
  let seq = styleCache.get(p.seed);
  if (!seq) {
    seq = ["clean"];
    if (styleCache.size > 64) styleCache.clear();
    styleCache.set(p.seed, seq);
  }
  while (seq.length <= phrase) {
    const n = seq.length;
    const prev = seq[n - 1];
    const r = rng(barSeed(p.seed, n, 3));
    seq.push(r.pick(STYLES.filter((x) => x !== prev)));
  }
  return seq[Math.max(0, phrase)];
}
/** Per-object style sequences (they are extended as the music goes on). */
const styleCache = new Map<number, GuitarStyle[]>();

/** Rhythms (in beats) for clean arpeggios: few notes, left to ring. */
const ARP_RHYTHMS = [
  [0, 1, 2, 3],
  [0, 0.5, 1.5, 2.5],
  [0, 1.5, 3],
  [0, 0.75, 1.5, 2.25, 3],
  [0, 2],
  [0.5, 2, 3.5],
];
/** Chord colours for clean passages: triad + octave, add9, sus2, sus4-ish (scale degrees above the root). */
const ARP_SHAPES = [
  [0, 2, 4, 7],
  [0, 4, 7, 8],
  [0, 1, 4, 7],
  [0, 3, 4, 7],
];

function ambientMetal(p: MusicParams, plan: BarPlan, bar: number, chordDegree: number, chordStart: boolean, genre: GenrePreset, energy: number) {
  const { phraseLength, chordBars } = genre.rules;
  const phrase = Math.floor(bar / phraseLength);
  const style = guitarStyle(p, phrase);
  plan.guitarTone = { style, ...TONES[style] };
  const r = rng(barSeed(p.seed, bar, 4));
  const deg = (base: number, d: number) => degreeToMidi(base, p.scale, chordDegree + d);
  /** Octave base so the chord root lands in [lo, lo + 12). */
  const baseFor = (lo: number) => {
    let base = p.rootMidi - 36;
    while (deg(base, 0) < lo) base += 12;
    return base;
  };

  if (style === "clean" || style === "shimmer") {
    const base = baseFor(style === "shimmer" ? 64 : 50);
    const shape = r.pick(ARP_SHAPES);
    const rhythm = style === "shimmer" ? r.pick([[0, 2], [0, 1.5, 3], [1, 3]]) : r.pick(ARP_RHYTHMS);
    // Walk across the chord shape: never the same note twice running, direction changes freely.
    let i = r.int(0, shape.length - 1);
    let last = -1;
    let lastMidi = -1;
    for (const time of rhythm) {
      let next = i + r.pick([-2, -1, 1, 1, 2]);
      if (next < 0 || next >= shape.length) next = i - Math.sign(next - i);
      if (next === last || next < 0 || next >= shape.length) next = (i + 1) % shape.length;
      last = i;
      i = next;
      let midi = deg(base, shape[i]) + (r.chance(0.15) ? 12 : 0);
      if (midi === lastMidi) midi = deg(base, shape[i]) === lastMidi ? midi + 12 : deg(base, shape[i]); // an octave jump can land on the last note
      lastMidi = midi;
      plan.clean.push({ time, midi, dur: style === "shimmer" ? 4 : r.pick([2, 3, 4]), vel: 0.32 + r.range(0, 0.22) });
    }
    if (style === "clean" && chordStart && r.chance(0.5)) plan.drums.kick.push({ time: 0, vel: 0.4 });
  } else if (style === "crunch") {
    // One open chord per change, left to ring; sometimes a softer re-strike.
    const base = baseFor(38);
    const voicing = r.pick([[0, 4, 7, 9], [0, 4, 7], [0, 7, 9, 11]]);
    if (chordStart) {
      voicing.forEach((d, k) => plan.guitar.push({ time: k * 0.04, midi: deg(base, d), dur: chordBars * BEATS - 0.3, vel: 0.6 - k * 0.05 }));
      plan.drums.kick.push({ time: 0, vel: 0.75 });
    } else {
      if (r.chance(0.35)) voicing.slice(0, 2).forEach((d, k) => plan.guitar.push({ time: 2.5 + k * 0.03, midi: deg(base, d), dur: 1.4, vel: 0.42 }));
      plan.drums.snare.push({ time: 2, vel: 0.55 });
    }
  } else if (style === "wall") {
    // High gain, swelled in: a slow tide of sound, not a riff.
    const base = baseFor(33);
    if (chordStart) {
      for (const [k, d] of [0, 4, 7].entries()) plan.guitar.push({ time: k * 0.02, midi: deg(base, d), dur: chordBars * BEATS - 0.1, vel: 0.75 - k * 0.08 });
    }
    plan.drums.kick.push({ time: 0, vel: 0.85 });
    plan.drums.snare.push({ time: 2, vel: 0.75 });
    if (energy > 0.7) plan.drums.hat.push({ time: 0, vel: 0.14 }, { time: 2, vel: 0.12 }); // a ride on half notes, barely there
  }

  if (bar % phraseLength === 0 && (style === "wall" || style === "crunch")) plan.drums.crash.push({ time: 0, vel: style === "wall" ? 0.55 : 0.35 });
  // A short fill only when a wall is about to arrive.
  if (bar % phraseLength === phraseLength - 1 && guitarStyle(p, phrase + 1) === "wall") {
    for (const [t, v] of [[3, 0.5], [3.5, 0.65]]) if (!plan.drums.snare.some((h) => h.time === t)) plan.drums.snare.push({ time: t, vel: v });
  }
}
