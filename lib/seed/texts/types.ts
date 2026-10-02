import type { SeedSlug } from "../refs";

/** [display name, curated description] for every seed object. */
export type SeedTexts = Record<SeedSlug, [name: string, description: string]>;
