import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { composeBar, guitarStyle, initialState, type BarPlan } from "@/lib/audio/composer";
import { GENRE_LIST, ambient, lofi, metal } from "@/lib/audio/genres";
import {
  brightnessFromTemperature,
  depthFromDistance,
  harmonyFromRatio,
  mapToMusic,
  periodToBpm,
} from "@/lib/audio/mapping";
import { mixedBpm, neutralMix, sanitizeMix, type GenreMix } from "@/lib/audio/mix";
import { chordMidi, inScale, quantize, voiceLead } from "@/lib/audio/theory";
import { normalize } from "@/lib/sources/normalize";
import type { RawBundle, SpaceObject } from "@/lib/sources/types";
import { SEED_SLUGS } from "@/lib/seed";

const load = (slug: string): SpaceObject =>
  normalize(JSON.parse(readFileSync(path.join(__dirname, "../fixtures", `${slug}.json`), "utf8")) as RawBundle, {
    slug,
  });
const objects = SEED_SLUGS.map(load);

const allNotes = (plan: BarPlan) => [...plan.pad, ...plan.bass, ...plan.lead, ...plan.texture, ...plan.guitar, ...plan.clean].map((n) => n.midi);

describe("theory", () => {
  it("builds diatonic seventh chords", () => {
    expect(chordMidi(57, "aeolian", 0)).toEqual([57, 60, 64, 67]); // Am7
    expect(chordMidi(60, "major", 4)).toEqual([67, 71, 74, 77]); // G7
  });
  it("quantizes to the scale", () => {
    expect(quantize(61, 60, "major")).toBe(60);
    expect(inScale(quantize(66, 60, "major"), 60, "major")).toBe(true);
  });
  it("voice-leads with small motion", () => {
    const a = voiceLead([57, 60, 64, 67], null);
    const b = voiceLead([62, 65, 69, 72], a);
    const motion = b.reduce((s, n, i) => s + Math.abs(n - a[i]), 0);
    expect(motion).toBeLessThanOrEqual(10);
  });
});

describe("mapping", () => {
  it("folds periods into the BPM range by octaves", () => {
    const crab = periodToBpm(0.0334, ambient.bpmRange);
    expect(crab.bpm).toBeGreaterThanOrEqual(56);
    expect(crab.bpm).toBeLessThanOrEqual(84);
    expect(crab.octaves).toBeLessThan(-3);
    const jupiter = periodToBpm(4332.6 * 86400, lofi.bpmRange);
    expect(jupiter.bpm).toBeGreaterThanOrEqual(68);
    expect(jupiter.octaves).toBeGreaterThan(20);
  });

  it("keeps octave-related periods on the same tempo", () => {
    expect(periodToBpm(1, ambient.bpmRange).bpm).toBe(periodToBpm(0.25, ambient.bpmRange).bpm);
  });

  it("maps temperature and distance monotonically", () => {
    expect(brightnessFromTemperature(165)).toBeLessThan(brightnessFromTemperature(3600));
    expect(brightnessFromTemperature(3600)).toBeLessThan(brightnessFromTemperature(12600));
    expect(depthFromDistance(1e-4)).toBeLessThan(depthFromDistance(500));
  });

  it("hears Saturn/Jupiter-like orbit ratios as simple intervals", () => {
    const h = harmonyFromRatio({ type: "planet", params: { orbital_period_days: 365.256 * 1.5 } });
    expect(h.semitones).toBe(7); // 3:2 -> perfect fifth
  });

  it("uses defaults when parameters are missing", () => {
    const m = mapToMusic({ slug: "x", type: "pulsar", params: {}, lightCurve: null }, ambient);
    expect(m.bpm).toBeGreaterThan(0);
    expect(m.timbre).toBe("bell");
  });

  it.each(objects.map((o) => [o.slug, o] as const))("%s maps into every genre's ranges", (_, o) => {
    for (const g of GENRE_LIST) {
      const m = mapToMusic(o, g);
      expect(m.bpm).toBeGreaterThanOrEqual(g.bpmRange[0]);
      expect(m.bpm).toBeLessThanOrEqual(g.bpmRange[1]);
      expect(g.scales).toContain(m.scale);
      expect(m.reverbWet).toBeLessThan(0.7);
      expect(m.dynamics.curve).toHaveLength(64);
    }
  });

  it("gives different objects different music", () => {
    const sigs = new Set(objects.map((o) => JSON.stringify(((m) => [m.bpm, m.rootMidi, m.scale, m.timbre])(mapToMusic(o, ambient)))));
    expect(sigs.size).toBeGreaterThanOrEqual(6);
  });
});

describe("composer", () => {
  it.each(objects.map((o) => [o.slug, o] as const))("%s: every note stays in key over 64 bars", (_, o) => {
    for (const g of GENRE_LIST) {
      const m = mapToMusic(o, g);
      const state = initialState(m);
      for (let bar = 0; bar < 64; bar++) {
        const plan = composeBar(m, g, bar, state);
        for (const midi of allNotes(plan)) {
          expect(inScale(midi, m.rootMidi, m.scale)).toBe(true);
          expect(midi).toBeGreaterThanOrEqual(24);
          expect(midi).toBeLessThanOrEqual(108);
        }
        for (const n of [...plan.pad, ...plan.lead, ...plan.bass]) {
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
          expect(n.time).toBeGreaterThanOrEqual(0);
          expect(n.time).toBeLessThan(4);
        }
      }
    }
  });

  it("ambient metal: sparse guitar and drums, a new guitar character every phrase", () => {
    const { phraseLength } = metal.rules;
    for (const o of objects) {
      const m = mapToMusic(o, metal);
      expect(m.bpm).toBeLessThanOrEqual(72);
      const state = initialState(m);
      let guitarNotes = 0, kicks = 0, hats = 0;
      const BARS = 96;
      for (let bar = 0; bar < BARS; bar++) {
        const plan = composeBar(m, metal, bar, state);
        guitarNotes += plan.guitar.length + plan.clean.length;
        kicks += plan.drums.kick.length;
        hats += plan.drums.hat.length;
        // Clean lines never repeat a note back to back.
        for (let i = 1; i < plan.clean.length; i++) expect(plan.clean[i].midi).not.toBe(plan.clean[i - 1].midi);
        for (const hits of Object.values(plan.drums)) {
          const times = hits.map((h) => h.time);
          expect(new Set(times).size).toBe(times.length); // a mono voice can't hit twice at once
        }
      }
      expect(guitarNotes / BARS).toBeLessThan(3.5);
      expect(kicks / BARS).toBeLessThanOrEqual(1);
      expect(hats / BARS).toBeLessThan(0.6);

      const styles = Array.from({ length: BARS / phraseLength }, (_, i) => guitarStyle(m, i));
      expect(styles[0]).toBe("clean");
      for (let i = 1; i < styles.length; i++) expect(styles[i]).not.toBe(styles[i - 1]);
      expect(new Set(styles).size).toBeGreaterThanOrEqual(3);
    }
  });

  it("other genres have no guitar", () => {
    const m = mapToMusic(objects[0], ambient);
    expect(composeBar(m, ambient, 0, initialState(m)).guitar).toEqual([]);
  });

  it("is deterministic for a given object and bar", () => {
    const m = mapToMusic(objects[0], ambient);
    const a = Array.from({ length: 16 }, (_, b) => composeBar(m, ambient, b, initialState(m)));
    const s = initialState(m);
    const b = Array.from({ length: 16 }, (_, i) => composeBar(m, ambient, i, s));
    expect(a.map((p) => p.chord)).toEqual(b.map((p) => p.chord));
  });

  it("varies slowly: phrases differ, but not every bar is new", () => {
    const m = mapToMusic(load("algol"), lofi);
    const state = initialState(m);
    const leads = Array.from({ length: 64 }, (_, b) => JSON.stringify(composeBar(m, lofi, b, state).lead.map((n) => n.midi)));
    expect(new Set(leads).size).toBeGreaterThan(8);
    const chords = Array.from({ length: 8 }, (_, b) => composeBar(m, lofi, b, initialState(m)).chordDegree);
    expect(chords.slice(0, 4)).toEqual(chords.slice(4, 8)); // progression repeats within a phrase cycle
  });

  it("puts pulsar ticks on the pulse grid", () => {
    const m = mapToMusic(load("crab-pulsar"), ambient);
    const plan = composeBar(m, ambient, 0, initialState(m));
    expect(plan.texture.length).toBeGreaterThan(0);
    for (const t of plan.texture) expect((t.time * m.pulse.subdivision) / 4).toBeCloseTo(Math.round((t.time * m.pulse.subdivision) / 4));
  });

  it("emits monophonic drum hits in time order", () => {
    const m = mapToMusic(load("algol"), lofi);
    const state = initialState(m);
    for (let bar = 0; bar < 64; bar++) {
      const { drums } = composeBar(m, lofi, bar, state);
      for (const hits of Object.values(drums)) {
        expect(hits.map((h) => h.time)).toEqual([...hits.map((h) => h.time)].sort((a, b) => a - b));
      }
    }
  });

  it("swings lo-fi off-beats", () => {
    const m = mapToMusic(load("jupiter"), lofi);
    const plan = composeBar(m, lofi, 0, initialState(m));
    expect(plan.drums.hat.some((h) => Math.abs((h.time % 1) - 0.5 - lofi.rules.swing / 2) < 1e-6)).toBe(true);
    expect(plan.drums.snare.map((s) => s.time)).toEqual([1, 3]);
  });
});

describe("listener mix", () => {
  const run = (genre: typeof ambient, mix: GenreMix | undefined, bars = 64) =>
    objects.slice(0, 12).flatMap((o) => {
      const m = mapToMusic(o, genre);
      const state = initialState(m);
      return Array.from({ length: bars }, (_, b) => composeBar(m, genre, b, state, mix));
    });
  const count = (plans: BarPlan[]) =>
    plans.reduce((n, p) => n + p.lead.length + p.texture.length + p.clean.length + p.guitar.length + p.drums.hat.length, 0);
  const melodic = (plans: BarPlan[]) => plans.flatMap((p) => [...p.lead, ...p.clean, ...p.texture].map((n) => n.midi));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it("the neutral mix reproduces the preset exactly", () => {
    for (const g of GENRE_LIST) expect(JSON.stringify(run(g, neutralMix(), 24))).toBe(JSON.stringify(run(g, undefined, 24)));
  });

  it("density changes how many notes play, in every genre", () => {
    for (const g of GENRE_LIST) {
      const base = count(run(g, undefined));
      expect(count(run(g, sanitizeMix({ density: 0.4 })))).toBeLessThan(base * 0.8);
      expect(count(run(g, sanitizeMix({ density: 2.2 })))).toBeGreaterThan(base * 1.3);
    }
  });

  it("register moves the melody up or down and stays in key", () => {
    for (const g of GENRE_LIST) {
      const base = mean(melodic(run(g, undefined)));
      expect(mean(melodic(run(g, sanitizeMix({ register: 1 }))))).toBeGreaterThan(base + 2);
      expect(mean(melodic(run(g, sanitizeMix({ register: -1 }))))).toBeLessThan(base - 2);
    }
    for (const o of objects.slice(0, 6)) {
      const m = mapToMusic(o, metal);
      const state = initialState(m);
      for (let b = 0; b < 32; b++)
        for (const n of allNotes(composeBar(m, metal, b, state, sanitizeMix({ register: 1, density: 2.5 })))) expect(inScale(n, m.rootMidi, m.scale)).toBe(true);
    }
  });

  it("drive scales the guitar's distortion and keeps clean styles clean", () => {
    const m = mapToMusic(objects[0], metal);
    const tones = (drive: number) => {
      const state = initialState(m);
      return Array.from({ length: 96 }, (_, b) => composeBar(m, metal, b, state, sanitizeMix({ drive })).guitarTone!);
    };
    const wall = (drive: number) => tones(drive).find((t) => t.style === "crunch")!.drive;
    expect(wall(2)).toBeGreaterThan(wall(1));
    expect(tones(0).every((t) => t.drive === 0)).toBe(true);
    expect(tones(2).filter((t) => t.style === "clean").every((t) => t.drive === 0)).toBe(true);
  });

  it("sanitizes stored mixes", () => {
    expect(sanitizeMix(null)).toEqual(neutralMix());
    const m = sanitizeMix({ tempo: 3, density: -1, register: "x", layers: { lead: { db: 99, on: false } } });
    expect(m.tempo).toBe(0.25);
    expect(m.density).toBe(0.25);
    expect(m.register).toBe(0);
    expect(m.layers.lead).toEqual({ db: 9, on: false });
    expect(m.layers.bass).toEqual({ db: 0, on: true });
    expect(mixedBpm(60, sanitizeMix({ tempo: 0.1 }))).toBe(66);
  });
});
