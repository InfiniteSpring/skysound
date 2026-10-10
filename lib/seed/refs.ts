import type { ObjectType, Params } from "../sources/types";

/** Seed objects and the catalog ref each one is fetched from. */
export const SEED_REFS = [
  { slug: "sun", ref: "jpl:10" },
  { slug: "jupiter", ref: "jpl:599" },
  { slug: "saturn", ref: "jpl:699" },
  { slug: "crab-pulsar", ref: "simbad:PSR B0531+21" },
  { slug: "vela-pulsar", ref: "simbad:PSR B0833-45" },
  { slug: "betelgeuse", ref: "simbad:* alf Ori" },
  { slug: "delta-cephei", ref: "simbad:* del Cep" },
  { slug: "algol", ref: "simbad:* bet Per" },
  { slug: "mercury", ref: "jpl:199" },
  { slug: "venus", ref: "jpl:299" },
  { slug: "mars", ref: "jpl:499" },
  { slug: "moon", ref: "jpl:301" },
  { slug: "uranus", ref: "jpl:799" },
  { slug: "neptune", ref: "jpl:899" },
  { slug: "pluto", ref: "jpl:999" },
  { slug: "titan", ref: "jpl:606" },
  { slug: "io", ref: "jpl:501" },
  { slug: "halley", ref: "jpl:DES=1P;CAP;NOFRAG" },
  { slug: "sirius", ref: "simbad:* alf CMa" },
  { slug: "vega", ref: "simbad:* alf Lyr" },
  { slug: "polaris", ref: "simbad:* alf UMi" },
  { slug: "rigel", ref: "simbad:* bet Ori" },
  { slug: "antares", ref: "simbad:* alf Sco" },
  { slug: "arcturus", ref: "simbad:* alf Boo" },
  { slug: "aldebaran", ref: "simbad:* alf Tau" },
  { slug: "deneb", ref: "simbad:* alf Cyg" },
  { slug: "mira", ref: "simbad:* omi Cet" },
  { slug: "rr-lyrae", ref: "simbad:V* RR Lyr" },
  { slug: "eta-carinae", ref: "simbad:* eta Car" },
  { slug: "proxima-centauri", ref: "simbad:NAME Proxima Centauri" },
  { slug: "alpha-centauri", ref: "simbad:* alf Cen" },
  { slug: "psr-b1919-21", ref: "atnf:B1919+21" },
  { slug: "psr-j0437-4715", ref: "atnf:J0437-4715" },
  { slug: "geminga", ref: "atnf:J0633+1746" },
  { slug: "hulse-taylor", ref: "atnf:B1913+16" },
  { slug: "sgr-a-star", ref: "simbad:NAME Sgr A*" },
  { slug: "m87-star", ref: "simbad:M  87" },
  { slug: "cygnus-x-1", ref: "simbad:HD 226868" },
  { slug: "v404-cygni", ref: "simbad:V* V404 Cyg" },
  { slug: "gaia-bh3", ref: "simbad:LS  II +14   13" },
] as const;

/**
 * Curated facts catalogs don't provide or file differently: black holes show up in SIMBAD
 * as X-ray sources, galaxies or ordinary stars (their visible companions).
 */
export const SEED_OVERRIDES: Partial<Record<(typeof SEED_REFS)[number]["slug"], { type?: ObjectType; params?: Partial<Params> }>> = {
  "sgr-a-star": { type: "black_hole", params: { mass_msun: 4.3e6, distance_ly: 26_670 } },
  "m87-star": { type: "black_hole", params: { mass_msun: 6.5e9, distance_ly: 53.5e6 } },
  "cygnus-x-1": { type: "black_hole", params: { mass_msun: 21.2, distance_ly: 7_200 } },
  "v404-cygni": { type: "black_hole", params: { mass_msun: 9, distance_ly: 7_800 } },
  "gaia-bh3": { type: "black_hole", params: { mass_msun: 33, distance_ly: 1_926 } },
};

export type SeedSlug = (typeof SEED_REFS)[number]["slug"];
