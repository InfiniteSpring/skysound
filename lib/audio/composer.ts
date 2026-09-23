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

export interface BarPlan {
  bar: number;
  chordDegree: number;
  chord: number[];
  pad: NoteEvent[];
  bass: NoteEvent[];
  lead: NoteEvent[];
  texture: NoteEvent[];
  drums: { kick: HitEvent[]; snare: HitEvent[]; hat: HitEvent[] };
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
    drums: { kick: [], snare: [], hat: [] },
    dynamics: [],
  };

  // Dynamics: sample the folded light curve at each beat.
  const { curve, bars } = p.dynamics;
  for (let b = 0; b < BEATS; b++) {
    const phase = (((bar % bars) * BEATS + b) / (bars * BEATS)) % 1;
    plan.dynamics.push(curve[Math.floor(phase * curve.length) % curve.length]);
  }

  // Pad
  const voicing = voiceLead(chord, state.voicing, genre.id === "lofi" ? 55 : 52, genre.id === "lofi" ? 74 : 72);
  if (chordStart) {
    state.voicing = voicing;
    if (genre.instruments.pad === "drone") {
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
  if (genre.instruments.bass === "sub") {
    if (chordStart) plan.bass.push({ time: 0, midi: bass, dur: chordBars * BEATS - 0.25, vel: 0.55 });
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
      const dur = genre.id === "ambient" ? r.pick([1.5, 2, 3]) : r.pick([0.5, 0.75, 1]);
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

  // Drum voices are monophonic: Tone needs their hits in time order.
  for (const hits of Object.values(plan.drums)) hits.sort((a: HitEvent, b: HitEvent) => a.time - b.time);
  return plan;
}
