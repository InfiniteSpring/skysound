import { z } from "zod";
import { requestJson } from "./http";

/**
 * Wikidata bridges non-Latin names to catalogs: "Бетельгейзе" -> Q12124 -> SIMBAD "* alf Ori".
 * Scientific catalogs only understand Latin designations, so this is how Russian search works.
 */
const API = "https://www.wikidata.org/w/api.php";

/** SIMBAD identifier and JPL Small-Body Database SPK-ID properties. */
const P_SIMBAD = "P3083";
const P_SPK = "P716";

export interface WikidataHit {
  id: string;
  label: string;
  enLabel?: string;
  simbad?: string;
  spk?: string;
}

const SearchSchema = z.object({ search: z.array(z.object({ id: z.string() })).default([]) });

const ClaimSchema = z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.unknown() }).optional() }) });
const EntitiesSchema = z.object({
  entities: z
    .record(
      z.string(),
      z.object({
        labels: z.record(z.string(), z.object({ value: z.string() })).default({}),
        claims: z.record(z.string(), z.array(ClaimSchema)).default({}),
      }),
    )
    .default({}),
});

export function parseEntities(json: unknown, ids: string[], lang: string): WikidataHit[] {
  const { entities } = EntitiesSchema.parse(json);
  const claim = (e: (typeof entities)[string], p: string) => {
    const v = e.claims[p]?.[0]?.mainsnak.datavalue?.value;
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return ids
    .map((id) => ({ id, e: entities[id] }))
    .filter(({ e }) => e)
    .map(({ id, e }) => ({
      id,
      label: e.labels[lang]?.value ?? e.labels.en?.value ?? id,
      enLabel: e.labels.en?.value,
      simbad: claim(e, P_SIMBAD),
      spk: claim(e, P_SPK),
    }));
}

export async function searchWikidata(query: string, lang = "ru", limit = 5): Promise<WikidataHit[]> {
  const search = SearchSchema.parse(
    await requestJson(
      `${API}?${new URLSearchParams({ action: "wbsearchentities", search: query, language: lang, uselang: lang, type: "item", limit: String(limit), format: "json" })}`,
      { source: "wikidata" },
    ),
  );
  const ids = search.search.map((s) => s.id);
  if (!ids.length) return [];
  const json = await requestJson(
    `${API}?${new URLSearchParams({ action: "wbgetentities", ids: ids.join("|"), props: "labels|claims", languages: `${lang}|en`, format: "json" })}`,
    { source: "wikidata" },
  );
  return parseEntities(json, ids, lang);
}

/**
 * Catalogs only understand Latin designations: go through Wikidata whenever the viewer
 * reads a language other than English, or types any non-ASCII name.
 */
export const needsLocalizedSearch = (q: string, lang: string) => lang !== "en" || /[^\x00-\x7f]/.test(q);

/** Language implied by the script of a non-Latin query ("火星" -> zh), so any UI can search any script. */
export function scriptLang(q: string): string | null {
  if (/[\u0400-\u04ff]/.test(q)) return "ru";
  if (/[\u4e00-\u9fff]/.test(q)) return "zh";
  if (/[\u0900-\u097f]/.test(q)) return "hi";
  if (/[\u0980-\u09ff]/.test(q)) return "bn";
  if (/[\u0600-\u06ff]/.test(q)) return /[ٹڈڑںےۓ]/.test(q) ? "ur" : "ar";
  return null;
}
