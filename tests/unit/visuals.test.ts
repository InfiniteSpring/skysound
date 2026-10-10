import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapToMusic } from "@/lib/audio/mapping";
import { ambient } from "@/lib/audio/genres";
import { SEED } from "@/lib/seed";
import { visibleSpinHz, visualFor } from "@/lib/sky/visuals";
import { normalize } from "@/lib/sources/normalize";
import type { RawBundle } from "@/lib/sources/types";

const objects = SEED.map((s) =>
  normalize(JSON.parse(readFileSync(path.join(__dirname, "../fixtures", `${s.slug}.json`), "utf8")) as RawBundle, {
    slug: s.slug,
    type: s.type,
    params: s.params,
  }),
);
const bySlug = Object.fromEntries(objects.map((o) => [o.slug, o]));
const visual = (slug: string) => visualFor(bySlug[slug]);

describe("close-up visuals", () => {
  it.each(objects.map((o) => [o.slug, o] as const))("%s gets a close-up", (_, o) => {
    const v = visualFor(o);
    expect(v.kind).toBeTruthy();
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/NaN|null,null/);
  });

  it("uses hand-tuned looks for known planets", () => {
    const saturn = visual("saturn");
    expect(saturn.kind === "planet" && saturn.rings?.gap).toBeTruthy();
    const jupiter = visual("jupiter");
    expect(jupiter.kind === "planet" && jupiter.look.spot).toBeTruthy(); // Great Red Spot
    const uranus = visual("uranus");
    expect(uranus.kind === "planet" && uranus.tiltDeg).toBe(98);
  });

  it("shows eclipsing and visual binaries as two stars", () => {
    const algol = visual("algol");
    expect(algol.kind).toBe("binary");
    expect(algol.kind === "binary" && algol.inclination).toBeGreaterThan(0.85); // edge-on: eclipses
    expect(visual("sirius").kind).toBe("binary");
  });

  it("renders black holes, active and dormant", () => {
    for (const slug of ["sgr-a-star", "m87-star", "cygnus-x-1", "v404-cygni", "gaia-bh3"]) {
      expect(bySlug[slug].type, slug).toBe("black_hole");
      expect(visual(slug).kind, slug).toBe("black_hole");
    }
    const m87 = visual("m87-star");
    expect(m87.kind === "black_hole" && m87.jet).toBe(true);
    const bh3 = visual("gaia-bh3");
    expect(bh3.kind === "black_hole" && bh3.disk).toBe(0);
    // Cygnus X-1 feeds on a blue supergiant, V404 Cygni on a small orange star.
    const cyg = visual("cygnus-x-1");
    const v404 = visual("v404-cygni");
    expect(cyg.kind === "black_hole" && v404.kind === "black_hole" && cyg.companion!.radius > v404.companion!.radius).toBe(true);
  });

  it("gives supergiants coarse convection cells and dwarfs fine granulation", () => {
    const betelgeuse = visual("betelgeuse");
    const sun = visual("sun");
    expect(betelgeuse.kind === "star" && sun.kind === "star" && betelgeuse.star.granulation < sun.star.granulation).toBe(true);
  });

  it("guesses looks for unknown objects from their type and temperature", () => {
    const base = { slug: "x", canonicalKey: "jpl:123", lightCurve: null };
    expect(visualFor({ ...base, type: "planet", params: { temperature_k: 700 } }).kind).toBe("planet");
    expect(visualFor({ ...base, type: "small_body", canonicalKey: "jpl:DES=2P;CAP;NOFRAG", params: {} }).kind).toBe("comet");
    expect(visualFor({ ...base, type: "black_hole", params: {} }).kind).toBe("black_hole");
    expect(visualFor({ ...base, type: "variable_star", params: { temperature_k: 3500 }, lightCurve: { kind: "model", period_s: 1, samples: Array(16).fill(0.5) } }).kind).toBe("star");
  });

  it("folds pulsar spin into a visible rate", () => {
    for (const p of [0.00576, 0.0334, 0.089, 1.337]) {
      const f = visibleSpinHz(p);
      expect(f).toBeGreaterThanOrEqual(0.4);
      expect(f).toBeLessThanOrEqual(1.6);
    }
  });
});

describe("black hole music", () => {
  it("sounds dark even with a hot companion", () => {
    const m = mapToMusic(bySlug["cygnus-x-1"], ambient);
    expect(m.timbre).toBe("dark");
    expect(m.brightness).toBeLessThanOrEqual(0.25);
  });
});
