/**
 * Seed objects: curated names and descriptions in every UI language on top of catalog data.
 * Shared by scripts/seed.ts, scripts/rebuild.ts and generateStaticParams (seed pages are prerendered).
 */
import { LANGS, type Lang } from "../i18n/config";
import type { ObjectType, Params } from "../sources/types";
import { SEED_OVERRIDES, SEED_REFS, type SeedSlug } from "./refs";
import ar from "./texts/ar";
import bn from "./texts/bn";
import en from "./texts/en";
import es from "./texts/es";
import fr from "./texts/fr";
import hi from "./texts/hi";
import pt from "./texts/pt";
import ru from "./texts/ru";
import type { SeedTexts } from "./texts/types";
import ur from "./texts/ur";
import zh from "./texts/zh";

const TEXTS: Record<Lang, SeedTexts> = { en, zh, hi, es, fr, ar, bn, pt, ru, ur };

export interface SeedEntry {
  slug: SeedSlug;
  ref: string;
  names: Record<Lang, string>;
  descriptions: Record<Lang, string>;
  type?: ObjectType;
  params?: Partial<Params>;
}

export const SEED: SeedEntry[] = SEED_REFS.map(({ slug, ref }) => ({
  slug,
  ref,
  names: Object.fromEntries(LANGS.map((l) => [l, TEXTS[l][slug][0]])) as Record<Lang, string>,
  descriptions: Object.fromEntries(LANGS.map((l) => [l, TEXTS[l][slug][1]])) as Record<Lang, string>,
  ...SEED_OVERRIDES[slug],
}));

export const SEED_SLUGS = SEED.map((s) => s.slug);
