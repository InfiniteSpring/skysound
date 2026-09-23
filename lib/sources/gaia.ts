import { slugify } from "../slug";
import { num, tapQuery, tapRecords, type TapTable } from "./tap";
import { CatalogError, type SourceAdapter } from "./types";

const TAP = "https://gea.esac.esa.int/tap-server/tap/sync";

export type GaiaRaw = TapTable;

export interface GaiaParsed {
  sourceId: string;
  ra?: number;
  dec?: number;
  parallaxMas?: number;
  gMag?: number;
  teffK?: number;
  luminositySun?: number;
  distancePc?: number;
}

export function parseGaia(raw: GaiaRaw): GaiaParsed | null {
  const r = tapRecords(raw)[0];
  if (!r) return null;
  return {
    sourceId: String(r.source_id),
    ra: num(r.ra),
    dec: num(r.dec),
    parallaxMas: num(r.parallax),
    gMag: num(r.phot_g_mean_mag),
    teffK: num(r.teff_gspphot),
    luminositySun: num(r.lum_flame),
    distancePc: num(r.distance_gspphot),
  };
}

const isSourceId = (s: string) => /^\d{6,20}$/.test(s);

export const gaia: SourceAdapter<GaiaRaw> = {
  id: "gaia",

  async search(query) {
    const id = query.replace(/^gaia\s*dr3\s*/i, "").trim();
    if (!isSourceId(id)) return [];
    const name = `Gaia DR3 ${id}`;
    return [{ source: "gaia", ref: `gaia:${id}`, name, slug: slugify(name), type: "star", hint: "Gaia DR3" }];
  },

  async fetch(sourceId) {
    if (!isSourceId(sourceId)) throw new CatalogError(`Bad Gaia source_id ${sourceId}`, "gaia", false);
    return tapQuery(
      TAP,
      `SELECT g.source_id, g.ra, g.dec, g.parallax, g.phot_g_mean_mag,
              a.teff_gspphot, a.lum_flame, a.distance_gspphot
       FROM gaiadr3.gaia_source AS g
       LEFT JOIN gaiadr3.astrophysical_parameters AS a ON a.source_id = g.source_id
       WHERE g.source_id = ${sourceId}`,
      "gaia",
    );
  },
};
