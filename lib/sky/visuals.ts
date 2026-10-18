import type { LightCurve, ObjectType, Params } from "../sources/types";

/**
 * How an object looks up close. Known objects get hand-tuned presets (Jupiter's bands,
 * Saturn's rings, Algol's eclipsing pair…); everything else is a plausible guess from
 * its type, temperature, spectral class and light curve.
 */

export type RGB = [number, number, number];

export interface StarLook {
  color: RGB;
  /** Relative radius (1 = the close-up's base size). */
  radius: number;
  /** Surface noise frequency: high = fine granulation (dwarfs), low = huge convection cells (supergiants). */
  granulation: number;
  /** Brightness contrast of the surface pattern. */
  contrast: number;
  /** Corona size relative to the radius; 0 = none. */
  corona: number;
  /** Starspots darkness (cool stars). */
  spots: number;
  /** Occasional flares (red dwarfs). */
  flares: boolean;
  /** Magnetic activity: prominences and chromosphere strength (0 for hot stars). */
  activity: number;
  /** Strength of fine radial rays in the corona (0 = smooth). */
  rays?: number;
  /** Spots confined to mid-latitude activity belts, like the Sun's (instead of anywhere). */
  spotBelts?: boolean;
  /** Visible rotation of the surface, radians per second. */
  spin?: number;
  /** Surface brightness (HDR); lower keeps a bright disc from blooming into a blur. */
  hdr?: number;
  /** A wide soft glare around the disc, in radii (the Sun, seen with the naked eye). */
  glare?: number;
}

export interface PlanetLook {
  colors: [string, string, string];
  /** Gas/cloud world (belts, soft terminator) vs. solid surface (relief, craters). */
  gas: boolean;
  /** Strength of terrain relief lighting for solid bodies. */
  bump: number;
  /** 0..1 strength of latitude bands (gas giants). */
  bands: number;
  bandFreq: number;
  /** Turbulence of bands / swirls. */
  turbulence: number;
  /** Rocky surface detail (craters, maria). */
  craters: number;
  polarCaps: number;
  spot: { lat: number; lon: number; size: number; color: string } | null;
  atmosphere: { color: string; strength: number } | null;
}

export interface RingLook {
  inner: number;
  outer: number;
  color: string;
  opacity: number;
  /** Cassini-like gap position (0..1 across the ring) or null. */
  gap: number | null;
}

export type Visual =
  | { kind: "star"; star: StarLook; pulse: number[] | null }
  | { kind: "binary"; a: StarLook; b: StarLook; separation: number; inclination: number; periodS: number }
  | {
      kind: "planet";
      look: PlanetLook;
      rings: RingLook | null;
      tiltDeg: number;
      spinS: number;
      radius: number;
      /** Lit from the Sun's real direction in the sky, so it shows its true phase (our Moon). */
      sunLit?: boolean;
    }
  | { kind: "comet" }
  | { kind: "pulsar"; spinHz: number; nebula: { colors: [string, string]; size: number } | null }
  | {
      kind: "black_hole";
      /** Disk temperature scale (K): hotter disks look whiter/bluer. */
      diskTemp: number;
      /** Outer disk radius in Schwarzschild radii (compact rings for the EHT-like face-on views). */
      diskOuter: number;
      /** Disk brightness; 0 for dormant black holes (only lensed starlight). */
      disk: number;
      /** 0 = face-on ring (like the EHT images), 1 = edge-on (Interstellar's Gargantua). */
      inclination: number;
      jet: boolean;
      companion: (StarLook & { distance: number }) | null;
    };

export interface VisualInput {
  slug: string;
  canonicalKey: string;
  type: ObjectType;
  params: Params;
  lightCurve: LightCurve | null;
}

/**
 * Perceptual star colours. A pure blackbody makes the Sun nearly white on screen; this ramp
 * follows how stars are usually pictured: red dwarfs deep orange, the Sun golden, hot stars blue.
 */
const STAR_RAMP: [number, RGB][] = [
  [2400, [1, 0.33, 0.1]],
  [3500, [1, 0.47, 0.18]],
  [4500, [1, 0.63, 0.3]],
  [5500, [1, 0.78, 0.38]],
  [6200, [1, 0.88, 0.6]],
  [7500, [1, 0.96, 0.86]],
  [9500, [0.92, 0.94, 1]],
  [14000, [0.76, 0.84, 1]],
  [30000, [0.6, 0.72, 1]],
];
export function starColor(k: number): RGB {
  if (k <= STAR_RAMP[0][0]) return STAR_RAMP[0][1];
  for (let i = 1; i < STAR_RAMP.length; i++) {
    const [k1, c1] = STAR_RAMP[i];
    if (k <= k1) {
      const [k0, c0] = STAR_RAMP[i - 1];
      const t = (k - k0) / (k1 - k0);
      return [0, 1, 2].map((j) => c0[j] + (c1[j] - c0[j]) * t) as RGB;
    }
  }
  return STAR_RAMP[STAR_RAMP.length - 1][1];
}
const rgb = (k: number) => starColor(k);

function star(temperature: number, spectral: string | undefined, over: Partial<StarLook> = {}): StarLook {
  const lumClass = spectral?.match(/(Ia|Iab|Ib|II|III|IV|V)\b/)?.[1] ?? "V";
  const supergiant = /^I/.test(lumClass) && lumClass !== "IV";
  const giant = supergiant || lumClass === "II" || lumClass === "III";
  const cool = temperature < 4200;
  const hot = temperature > 10000; // hot photospheres look smoother
  return {
    color: rgb(temperature),
    radius: 1,
    granulation: supergiant ? 2.2 : giant ? 4 : 9,
    contrast: (supergiant ? 0.55 : giant ? 0.38 : 0.28) * (hot ? 0.45 : 1),
    corona: supergiant ? 1.45 : giant ? 1.5 : 1.6,
    spots: cool ? (supergiant ? 0.35 : 0.2) : 0,
    flares: false,
    activity: temperature > 9000 ? 0 : temperature > 6500 ? 0.3 : 0.7,
    ...over,
  };
}

/**
 * The Sun's radius in close-up units (1 unit ≈ 2 px across a 900 px-high sky at the wide
 * view). It is always on screen as a real disc, so it is drawn larger than its true 0.27°
 * (1.7 units) to read as the Sun from the wide view; zooming in magnifies it naturally.
 */
export const SUN_RADIUS = 8;
/** Our Moon: just a little smaller than the Sun, as in the real sky. */
export const MOON_RADIUS = 7.2;
/**
 * Objects always drawn as real bodies at a fixed size in the sky (not as markers), so they
 * grow when you zoom in like they would through binoculars.
 */
export const RESIDENT_SLUGS: ReadonlySet<string> = new Set(["sun", "moon"]);

const PLANETS: Record<string, Omit<Extract<Visual, { kind: "planet" }>, "kind">> = {
  mercury: {
    radius: 0.8, tiltDeg: 0, spinS: 60, rings: null,
    look: { gas: false, bump: 0.35, colors: ["#8f8a85", "#b8b2ab", "#5a5652"], bands: 0, bandFreq: 0, turbulence: 0, craters: 0.95, polarCaps: 0, spot: null, atmosphere: null },
  },
  venus: {
    radius: 0.95, tiltDeg: 177, spinS: -70, rings: null,
    look: { gas: true, bump: 0, colors: ["#e3cf9e", "#f6ecd2", "#c4a467"], bands: 0.25, bandFreq: 5, turbulence: 0.8, craters: 0, polarCaps: 0, spot: null, atmosphere: { color: "#fff1c8", strength: 0.45 } },
  },
  mars: {
    radius: 0.85, tiltDeg: 25, spinS: 40, rings: null,
    look: { gas: false, bump: 0.25, colors: ["#b8603a", "#d99868", "#8a4428"], bands: 0, bandFreq: 0, turbulence: 0, craters: 0.3, polarCaps: 0.06, spot: null, atmosphere: { color: "#ff9d70", strength: 0.15 } },
  },
  // The Moon is as wide in our sky as the Sun (0.52° vs 0.53°): drawn nearly as large, lit
  // from the Sun's real direction (its phase), and not spinning: it always shows us one face.
  moon: {
    radius: MOON_RADIUS, tiltDeg: 7, spinS: Infinity, rings: null, sunLit: true,
    // Bright highlands, dark basaltic maria, softened craters.
    look: { gas: false, bump: 0.18, colors: ["#d2d0c9", "#ecebe6", "#5f5e5a"], bands: 0, bandFreq: 0, turbulence: 0, craters: 0.45, polarCaps: 0, spot: null, atmosphere: null },
  },
  jupiter: {
    radius: 1, tiltDeg: 3, spinS: 25, rings: null,
    look: { gas: true, bump: 0,
      colors: ["#c9a888", "#f1e7d4", "#9c7253"], bands: 0.8, bandFreq: 16, turbulence: 0.55, craters: 0, polarCaps: 0,
      spot: { lat: -0.38, lon: 0.9, size: 0.13, color: "#b4553a" }, atmosphere: { color: "#f3dcb0", strength: 0.22 },
    },
  },
  saturn: {
    radius: 0.82, tiltDeg: 27, spinS: 26,
    rings: { inner: 1.25, outer: 2.3, color: "#d8c9a3", opacity: 0.85, gap: 0.62 },
    look: { gas: true, bump: 0, colors: ["#dcc79a", "#f1e6c6", "#bfa274"], bands: 0.35, bandFreq: 12, turbulence: 0.2, craters: 0, polarCaps: 0, spot: null, atmosphere: { color: "#f5e6b8", strength: 0.2 } },
  },
  uranus: {
    radius: 0.9, tiltDeg: 98, spinS: -35,
    rings: { inner: 1.6, outer: 1.95, color: "#cfe8ee", opacity: 0.25, gap: null },
    look: { gas: true, bump: 0, colors: ["#9fd6df", "#c2ecf1", "#7fbecb"], bands: 0.12, bandFreq: 8, turbulence: 0.1, craters: 0, polarCaps: 0, spot: null, atmosphere: { color: "#c8f6ff", strength: 0.35 } },
  },
  neptune: {
    radius: 0.9, tiltDeg: 28, spinS: 32, rings: null,
    look: { gas: true, bump: 0,
      colors: ["#3557c9", "#6286e3", "#1f338a"], bands: 0.35, bandFreq: 10, turbulence: 0.3, craters: 0, polarCaps: 0,
      spot: { lat: -0.35, lon: 1.6, size: 0.1, color: "#16245e" }, atmosphere: { color: "#86a8ff", strength: 0.35 },
    },
  },
  pluto: {
    radius: 0.7, tiltDeg: 120, spinS: -60, rings: null,
    look: { gas: false, bump: 0.25,
      colors: ["#c4a07e", "#ecd8bd", "#6f4f3a"], bands: 0, bandFreq: 0, turbulence: 0, craters: 0.5, polarCaps: 0,
      spot: { lat: 0.15, lon: 0.4, size: 0.32, color: "#f4e9da" }, atmosphere: null,
    },
  },
  titan: {
    radius: 0.85, tiltDeg: 0, spinS: 60, rings: null,
    look: { gas: true, bump: 0, colors: ["#d0893a", "#e9a85d", "#9a5922"], bands: 0.12, bandFreq: 4, turbulence: 0.3, craters: 0, polarCaps: 0, spot: null, atmosphere: { color: "#ffb760", strength: 0.7 } },
  },
  io: {
    radius: 0.8, tiltDeg: 0, spinS: 45, rings: null,
    look: { gas: false, bump: 0.25, colors: ["#e3cf5f", "#f3eaa6", "#a8501f"], bands: 0, bandFreq: 0, turbulence: 0, craters: 0.85, polarCaps: 0, spot: null, atmosphere: null },
  },
};

const BLACK_HOLES: Record<string, Omit<Extract<Visual, { kind: "black_hole" }>, "kind">> = {
  // EHT saw Sgr A* and M87* nearly face-on: a glowing ring around the shadow.
  "sgr-a-star": { diskTemp: 5200, diskOuter: 7, disk: 1, inclination: 0.35, jet: false, companion: null },
  "m87-star": { diskTemp: 4600, diskOuter: 6.5, disk: 1, inclination: 0.12, jet: true, companion: null },
  // X-ray binaries: hot, nearly edge-on disks fed by a companion star.
  "cygnus-x-1": {
    diskTemp: 12000, diskOuter: 12, disk: 1, inclination: 0.82, jet: false,
    companion: { ...star(31000, "O9.7Iab"), radius: 0.95, distance: 8, corona: 1.4 },
  },
  "v404-cygni": {
    diskTemp: 7000, diskOuter: 11, disk: 0.85, inclination: 0.88, jet: false,
    companion: { ...star(4300, "K3III"), radius: 0.55, distance: 6 },
  },
  // Dormant: no disk, only lensed starlight around the shadow, and its old companion star.
  "gaia-bh3": {
    diskTemp: 6000, diskOuter: 10, disk: 0, inclination: 0.5, jet: false,
    companion: { ...star(5200, "G"), radius: 0.5, distance: 7 },
  },
};

const NEBULAE: Record<string, { colors: [string, string]; size: number }> = {
  // [filaments, synchrotron glow]
  "crab-pulsar": { colors: ["#ff7a45", "#7fb7ff"], size: 5 },
  "vela-pulsar": { colors: ["#b48cff", "#6f9dff"], size: 5 },
};

/** Visible spin: the real rate folded by octaves into 0.4–1.6 Hz (millisecond pulsars would just blur). */
export function visibleSpinHz(periodS: number | undefined) {
  let f = periodS ? 1 / periodS : 1;
  while (f > 1.6) f /= 2;
  while (f < 0.4) f *= 2;
  return f;
}


export function visualFor(o: VisualInput): Visual {
  const p = o.params;
  const T = p.temperature_k;

  if (PLANETS[o.slug]) return { kind: "planet", ...PLANETS[o.slug] };
  if (BLACK_HOLES[o.slug] || o.type === "black_hole") {
    return { kind: "black_hole", ...(BLACK_HOLES[o.slug] ?? { diskTemp: 6000, diskOuter: 11, disk: 1, inclination: 0.75, jet: false, companion: null }) };
  }

  switch (o.slug) {
    case "sun":
      // Large and dominant, fine granulation, a few sunspot groups in
      // the activity belts, a slow visible rotation and a calm corona without spiky rays.
      return {
        kind: "star",
        star: star(5772, "G2V", {
          // A white-light solar filter view: yellow-white disc, orange limb.
          color: [1, 0.76, 0.4],
          radius: SUN_RADIUS,
          granulation: 44,
          contrast: 0.24,
          corona: 0.6,
          activity: 1,
          spots: 0.9,
          spotBelts: true,
          spin: 0.012,
          rays: 0.15,
          hdr: 1.15,
          glare: 4,
        }),
        pulse: null,
      };
    case "algol":
      // Bright B8 star eclipsed every 2.87 days by a larger, dimmer K subgiant.
      return { kind: "binary", a: star(12600, "B8V", { radius: 0.75 }), b: star(4500, "K0IV", { radius: 0.95, corona: 0 }), separation: 5, inclination: 0.97, periodS: 14 };
    case "alpha-centauri":
      return { kind: "binary", a: star(5790, "G2V", { radius: 0.85 }), b: star(5260, "K1V", { radius: 0.7 }), separation: 6.5, inclination: 0.6, periodS: 24 };
    case "sirius":
      // Sirius A with its tiny, hot white-dwarf companion.
      return { kind: "binary", a: star(9900, "A1V", { radius: 1 }), b: star(25000, "DA2", { radius: 0.12, corona: 3 }), separation: 7, inclination: 0.35, periodS: 26 };
    case "proxima-centauri":
      return { kind: "star", star: star(3040, "M5.5V", { flares: true, spots: 0.3, activity: 1 }), pulse: null };
    case "eta-carinae":
      return { kind: "star", star: star(20000, "LBV Ia", { corona: 2.6, granulation: 2, contrast: 0.5 }), pulse: null };
  }

  if (o.type === "pulsar") {
    return { kind: "pulsar", spinHz: visibleSpinHz(p.period_s), nebula: NEBULAE[o.slug] ?? null };
  }
  if (o.type === "small_body") {
    return o.canonicalKey.includes("CAP") || /comet/i.test(o.slug)
      ? { kind: "comet" }
      : { kind: "planet", radius: 0.6, tiltDeg: 10, spinS: 30, rings: null, look: { ...PLANETS.moon.look, colors: ["#8d8173", "#b5a897", "#57504a"], bump: 0.4 } };
  }
  if (o.type === "planet" || o.type === "moon") {
    const t = T ?? 150;
    const base = t > 500 ? PLANETS.venus : t < 120 ? PLANETS.neptune : o.type === "moon" ? PLANETS.moon : PLANETS.mars;
    // Other moons borrow our Moon's look, not its size (only ours is huge in the sky).
    return base === PLANETS.moon
      ? { kind: "planet", ...base, radius: 0.8, spinS: 80, sunLit: false, look: { ...base.look, craters: 1, bump: 0.35 } }
      : { kind: "planet", ...base };
  }
  if (o.type === "star_system") {
    const t = T ?? 6000;
    return { kind: "binary", a: star(t, p.spectral_type, { radius: 0.85 }), b: star(t * 0.75, p.spectral_type, { radius: 0.65 }), separation: 6, inclination: 0.5, periodS: 20 };
  }

  // Stars and variable stars: pulsate along their (model) light curve.
  const look = star(T ?? 5800, p.spectral_type);
  return { kind: "star", star: look, pulse: o.lightCurve?.samples ?? null };
}

