import { slugify } from "../slug";
import { atnf, normalizePulsarName, parseAtnf } from "./atnf";
import { vsx } from "./aavso";
import { gaia } from "./gaia";
import { jpl, jplRef, classifyJpl } from "./jpl";
import { parseSimbad, resolveName, simbad } from "./simbad";
import { CatalogError, NotFoundError, type Candidate, type RawBundle } from "./types";
import { needsLocalizedSearch, scriptLang, searchWikidata, type WikidataHit } from "./wikidata";

export * from "./types";
export { normalize } from "./normalize";
export const adapters = { simbad, gaia, atnf, vsx, jpl };

/** Secondary catalogs enrich an object; their failure must not sink the whole fetch. */
async function optional<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p;
  } catch (err) {
    console.warn("[sources] optional catalog failed:", (err as Error).message);
    return undefined;
  }
}

async function bundleFromSimbad(mainId: string): Promise<RawBundle> {
  const simbadRaw = await simbad.fetch(mainId);
  const s = parseSimbad(simbadRaw);
  const isPulsar = s.otype === "Psr" || s.pulsarNames.length > 0;
  const [gaiaRaw, atnfRaw, vsxRaw] = await Promise.all([
    s.gaiaDr3 && !isPulsar ? optional(gaia.fetch(s.gaiaDr3)) : undefined,
    isPulsar && s.pulsarNames.length ? optional(atnf.fetch(s.pulsarNames.join(","))) : undefined,
    isPulsar ? undefined : optional(vsx.fetch(`${s.ra} ${s.dec >= 0 ? "+" : ""}${s.dec}`)),
  ]);
  return {
    simbad: simbadRaw,
    gaia: gaiaRaw,
    atnf: atnfRaw && parseAtnf(atnfRaw).length ? atnfRaw : undefined,
    vsx: vsxRaw,
  };
}

/** Fetch every catalog response needed for one object. `ref` is "<source>:<externalId>". */
export async function fetchBundle(ref: string): Promise<RawBundle> {
  const [source, ...rest] = ref.split(":");
  const id = rest.join(":");
  switch (source) {
    case "jpl":
      return { jpl: await jpl.fetch(id) };
    case "simbad":
      return bundleFromSimbad(id);
    case "atnf": {
      const hit = await optional(resolveName(`PSR ${id}`));
      if (hit) return bundleFromSimbad(hit.mainId);
      const atnfRaw = await atnf.fetch(id);
      if (!parseAtnf(atnfRaw).length) throw new NotFoundError(id);
      return { atnf: atnfRaw };
    }
    case "gaia":
      return { gaia: await gaia.fetch(id) };
    case "vsx": {
      const hit = await resolveName(id);
      if (!hit) throw new NotFoundError(id);
      return bundleFromSimbad(hit.mainId);
    }
    default:
      throw new CatalogError(`Unknown source in ref "${ref}"`, "resolver", false);
  }
}

/**
 * Free text -> a fetchable ref. Solar-system names go to Horizons (exact name match only,
 * so "Vela" doesn't become an asteroid), everything else to SIMBAD's name resolver.
 */
export async function resolveQuery(query: string): Promise<string> {
  const q = query.trim();
  if (!q) throw new NotFoundError(query);

  const psr = normalizePulsarName(q);
  if (psr) return `atnf:${psr}`;
  if (/^(gaia\s*dr3\s*)?\d{10,20}$/i.test(q)) return `gaia:${q.replace(/\D/g, "")}`;

  const hits = (await optional(jpl.lookup(q))) ?? [];
  const exact = hits.find((h) => h.name.toLowerCase() === q.toLowerCase() && classifyJpl(h.type, h.name));
  if (exact) return jplRef(exact);

  const hit = await resolveName(q);
  if (hit) return `simbad:${hit.mainId}`;
  throw new NotFoundError(query);
}

/**
 * A Wikidata hit -> a catalog candidate under its localized name. Stars carry a SIMBAD id;
 * comets/asteroids a JPL SPK-ID; planets and moons are matched by English label in Horizons.
 */
async function candidateFromWikidata(hit: WikidataHit): Promise<Candidate | null> {
  const named = (c: Candidate): Candidate => ({ ...c, name: hit.label, slug: slugify(hit.label), hint: `${c.hint} · ${hit.enLabel ?? hit.id}` });
  if (hit.simbad) {
    return { source: "simbad", ref: `simbad:${hit.simbad}`, name: hit.label, slug: slugify(hit.label), hint: `SIMBAD · ${hit.simbad}` };
  }
  const key = hit.spk ?? hit.enLabel;
  if (!key) return null;
  const found = await jpl.search(key);
  const exact = hit.spk ? found[0] : found.find((c) => c.name.toLowerCase() === key.toLowerCase());
  if (exact) return named(exact);
  // Last resort: SIMBAD's name resolver on the English label ("Sirius").
  if (hit.spk) return null;
  const [star] = await simbad.search(key);
  return star ? named(star) : null;
}

/** Localized names ("Бетельгейзе", "火星", "Marte"): resolve through Wikidata, then the catalogs. */
async function searchLocalized(q: string, lang: string): Promise<Candidate[]> {
  const hits = await searchWikidata(q, scriptLang(q) ?? lang);
  const settled = await Promise.allSettled(hits.slice(0, 4).map(candidateFromWikidata));
  return settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
}

/** Small TTL cache: typing produces many near-identical queries; catalogs have rate limits. */
const searchCache = new Map<string, { at: number; value: Promise<Candidate[]> }>();
const SEARCH_TTL_MS = 10 * 60_000;

/** Catalog search for the UI. Each source is independent; one being down only thins the results. */
export function searchCatalogs(query: string, lang = "en"): Promise<Candidate[]> {
  const q = query.trim();
  if (q.length < 2) return Promise.resolve([]);
  const key = `${lang}:${q.toLowerCase()}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.value;
  const value = searchCatalogsUncached(q, lang);
  searchCache.set(key, { at: Date.now(), value });
  if (searchCache.size > 500) searchCache.delete(searchCache.keys().next().value!);
  // Don't cache empty results caused by outages for long.
  void value.then((r) => !r.length && searchCache.delete(key)).catch(() => searchCache.delete(key));
  return value;
}

async function searchCatalogsUncached(q: string, lang: string): Promise<Candidate[]> {
  // Localized hits first (named in the viewer's language); Latin queries also go to the catalogs directly.
  const direct = /[^\x00-\x7f]/.test(q) ? [] : [jpl.search(q), simbad.search(q), atnf.search(q), gaia.search(q)];
  const results = await Promise.allSettled([
    ...(needsLocalizedSearch(q, lang) ? [searchLocalized(q, lang)] : []),
    ...direct,
  ]);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const r of results) {
    if (r.status === "rejected") {
      console.warn("[sources] search failed:", (r.reason as Error).message);
      continue;
    }
    for (const c of r.value) {
      const key = c.slug || slugify(c.name);
      if (!key || seen.has(key) || seen.has(c.ref)) continue;
      seen.add(key);
      seen.add(c.ref);
      out.push(c);
    }
  }
  return out.slice(0, 8);
}
