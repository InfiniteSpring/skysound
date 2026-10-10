import { z } from "zod";
import { LANGS } from "../i18n/config";

export const OBJECT_TYPES = [
  "star",
  "planet",
  "pulsar",
  "variable_star",
  "star_system",
  "moon",
  "small_body",
  "black_hole",
  "other",
] as const;

export const ObjectTypeSchema = z.enum(OBJECT_TYPES);
export type ObjectType = z.infer<typeof ObjectTypeSchema>;

export const SOURCE_IDS = ["simbad", "gaia", "atnf", "vsx", "jpl", "wikidata"] as const;
export const SourceIdSchema = z.enum(SOURCE_IDS);
export type SourceId = z.infer<typeof SourceIdSchema>;

/** Equatorial coordinates (ICRS, degrees). Solar-system bodies carry the epoch of the ephemeris. */
export const PositionSchema = z.object({
  ra_deg: z.number().min(0).max(360),
  dec_deg: z.number().min(-90).max(90),
  epoch: z.string().optional(),
});
export type Position = z.infer<typeof PositionSchema>;

const positive = z.number().positive().finite();

/**
 * Physical parameters. Every field is optional: catalogs rarely know everything,
 * and the audio mapping fills gaps with per-type defaults.
 *
 * period_s — the object's characteristic intrinsic period: pulsar spin,
 * variable-star pulsation/eclipse cycle, or body rotation.
 */
export const ParamsSchema = z.object({
  period_s: positive.optional(),
  rotation_period_s: positive.optional(),
  orbital_period_days: positive.optional(),
  temperature_k: positive.optional(),
  luminosity: positive.optional(),
  distance_ly: positive.optional(),
  magnitude_v: z.number().finite().optional(),
  amplitude_mag: z.number().nonnegative().finite().optional(),
  spectral_type: z.string().optional(),
  /** Mass in solar masses (curated for black holes; catalogs rarely give it). */
  mass_msun: positive.optional(),
  variability_type: z.string().optional(),
});
export type Params = z.infer<typeof ParamsSchema>;

/** Normalized flux samples over one period (0 = faintest, 1 = brightest). */
export const LightCurveSchema = z.object({
  kind: z.enum(["model", "observed"]),
  /** Template used for model curves; the UI turns it into a localized caption. */
  shape: z.enum(["pulsating", "eclipsing", "semiregular", "sine", "pulse", "pulse_interpulse"]).optional(),
  period_s: positive,
  samples: z.array(z.number().min(0).max(1)).min(8),
  note: z.string().optional(),
});
export type LightCurve = z.infer<typeof LightCurveSchema>;

export const SourceRefSchema = z.object({
  id: z.string(),
  url: z.url().optional(),
});
export const SourcesSchema = z.partialRecord(SourceIdSchema, SourceRefSchema);
export type Sources = z.infer<typeof SourcesSchema>;

export const SpaceObjectSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  /** Stable catalog identity, e.g. "jpl:599" or "simbad:* alf Ori" — prevents two slugs for one object. */
  canonicalKey: z.string().min(1),
  /** Catalog / English display name. */
  name: z.string().min(1),
  /** Localized display names (curated or chosen in search); falls back to `name`. */
  names: z.partialRecord(z.enum(LANGS), z.string().min(1)),
  /** Curated descriptions; objects without one get a generated description at render time. */
  descriptions: z.partialRecord(z.enum(LANGS), z.string().min(1)),
  type: ObjectTypeSchema,
  position: PositionSchema,
  params: ParamsSchema,
  lightCurve: LightCurveSchema.nullable(),
  sources: SourcesSchema,
});
export type SpaceObject = z.infer<typeof SpaceObjectSchema>;

/** A search hit from a catalog, not yet stored. `ref` is what the resolver needs to fetch it. */
export interface Candidate {
  source: SourceId;
  ref: string;
  name: string;
  slug: string;
  type?: ObjectType;
  hint?: string;
}

export interface SourceAdapter<Raw> {
  id: SourceId;
  search(query: string): Promise<Candidate[]>;
  fetch(externalId: string): Promise<Raw>;
}

/** Raw catalog responses for one object, persisted verbatim so params can be rebuilt offline. */
export interface RawBundle {
  simbad?: import("./simbad").SimbadRaw;
  gaia?: import("./gaia").GaiaRaw;
  atnf?: import("./atnf").AtnfRaw;
  vsx?: import("./aavso").VsxRaw;
  jpl?: import("./jpl").JplRaw;
}

export class CatalogError extends Error {
  constructor(
    message: string,
    readonly source: SourceId | "resolver",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "CatalogError";
  }
}

export class NotFoundError extends Error {
  constructor(query: string) {
    super(`No catalog knows "${query}"`);
    this.name = "NotFoundError";
  }
}
