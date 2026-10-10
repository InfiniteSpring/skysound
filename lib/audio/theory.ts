export const SCALES = {
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
} as const;

export type ScaleName = keyof typeof SCALES;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToName(midi: number) {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function midiToFreq(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Pitch of a scale degree (0-based, may exceed 6 or be negative) above `root`. */
export function degreeToMidi(root: number, scale: ScaleName, degree: number) {
  const steps = SCALES[scale];
  const octave = Math.floor(degree / steps.length);
  const idx = ((degree % steps.length) + steps.length) % steps.length;
  return root + octave * 12 + steps[idx];
}

/** Diatonic tertian chord on a scale degree: triad, 7th, add9 as `size` grows. */
export function chordDegrees(degree: number, size = 4) {
  return Array.from({ length: size }, (_, i) => degree + i * 2);
}

export function chordMidi(root: number, scale: ScaleName, degree: number, size = 4) {
  return chordDegrees(degree, size).map((d) => degreeToMidi(root, scale, d));
}

export function inScale(midi: number, root: number, scale: ScaleName) {
  const pc = (((midi - root) % 12) + 12) % 12;
  return (SCALES[scale] as readonly number[]).includes(pc);
}

/** Snap any pitch to the nearest scale tone (ties resolve downward). */
export function quantize(midi: number, root: number, scale: ScaleName) {
  for (let d = 0; d < 12; d++) {
    if (inScale(midi - d, root, scale)) return midi - d;
    if (inScale(midi + d, root, scale)) return midi + d;
  }
  return midi;
}

/**
 * Smooth voice leading: build every inversion as a close voicing whose bass sits in
 * [lo, lo + 12), keep those that fit under `hi`, and choose the one with the least total
 * motion from the previous voicing.
 */
export function voiceLead(chord: number[], previous: number[] | null, lo = 52, hi = 72) {
  const pcs = chord.map((n) => ((n % 12) + 12) % 12);
  const candidates = pcs.map((_, k) => {
    const out: number[] = [];
    for (let i = 0; i < pcs.length; i++) {
      const pc = pcs[(k + i) % pcs.length];
      let n = i === 0 ? lo + ((pc - lo) % 12 + 12) % 12 : out[i - 1] + 1 + ((pc - out[i - 1] - 1) % 12 + 12) % 12;
      if (i === 0 && n >= lo + 12) n -= 12;
      out.push(n);
    }
    return out;
  });
  const fitting = candidates.filter((v) => v.at(-1)! <= hi + 2);
  const pool = fitting.length ? fitting : candidates;
  if (!previous?.length) return pool.reduce((best, c) => (c.at(-1)! < best.at(-1)! ? c : best));
  const cost = (v: number[]) => v.reduce((s, n, i) => s + Math.abs(n - (previous[i] ?? previous.at(-1)!)), 0);
  return pool.reduce((best, c) => (cost(c) < cost(best) ? c : best));
}
