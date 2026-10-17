import { ListenButton } from "@/components/ui/ObjectControls";
import { pick, type Lang } from "@/lib/i18n/config";
import { describe, formatDistance, formatMass, formatPeriod, lightCurveNote } from "@/lib/i18n/describe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { ObjectDto } from "@/lib/objects/dto";

/*
 * The object card: type, name, description, Listen, facts, sources. Rendered on the server
 * for object pages and on the client for the home page's "now playing" card.
 */

export function objectTexts(o: ObjectDto, lang: Lang) {
  const name = pick(o.names, lang, o.name);
  return { name, description: o.descriptions[lang] ?? describe(o, name, lang) };
}

const SOURCE_LABELS: Record<string, string> = {
  simbad: "SIMBAD",
  gaia: "Gaia DR3",
  atnf: "ATNF Pulsar Catalogue",
  vsx: "AAVSO VSX",
  jpl: "JPL Horizons",
};

function facts(o: ObjectDto, lang: Lang): [string, string][] {
  const f = getDictionary(lang).object.facts;
  const p = o.params;
  const num = (v: number) => v.toLocaleString(lang);
  const rows: [string, string | undefined][] = [
    [f.type, getDictionary(lang).types[o.type]],
    [f.mass, p.mass_msun ? formatMass(p.mass_msun, lang) : undefined],
    [f.spectral, p.spectral_type],
    [f.variability, p.variability_type],
    [o.type === "variable_star" ? f.lightPeriod : f.spin, p.period_s ? formatPeriod(p.period_s, lang) : undefined],
    [f.orbit, p.orbital_period_days ? formatPeriod(p.orbital_period_days * 86400, lang) : undefined],
    [f.temperature, p.temperature_k ? `${num(Math.round(p.temperature_k))} K` : undefined],
    [f.luminosity, p.luminosity ? `${num(Number(p.luminosity.toPrecision(3)))} L☉` : undefined],
    [f.distance, p.distance_ly ? formatDistance(p.distance_ly, lang) : undefined],
    [f.magnitude, p.magnitude_v !== undefined ? String(p.magnitude_v) : undefined],
    [f.amplitude, p.amplitude_mag ? `${p.amplitude_mag} ${f.mag}` : undefined],
    [f.coords, `${o.position.ra_deg.toFixed(3)}°, ${o.position.dec_deg.toFixed(3)}°`],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
}

export function ObjectInfo({
  object: o,
  lang,
  as: Heading = "h1",
  nameNode,
}: {
  object: ObjectDto;
  lang: Lang;
  as?: "h1" | "h2";
  /** Replaces the plain name (e.g. with a link to the object's page). */
  nameNode?: React.ReactNode;
}) {
  const t = getDictionary(lang);
  const { name, description } = objectTexts(o, lang);
  return (
    <>
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">{t.types[o.type]}</p>
      <Heading className="mt-1 text-2xl font-light sm:text-3xl" data-testid="object-name">
        {nameNode ?? name}
      </Heading>
      <p className="mt-3 text-sm leading-relaxed text-white/70">{description}</p>
      <div className="mt-4">
        <ListenButton object={o} />
      </div>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        {facts(o, lang).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-white/40">{k}</dt>
            <dd className="text-white/80">
              {/* <bdi> keeps "3,633 K" and coordinates intact inside right-to-left pages */}
              <bdi>{v}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      {o.lightCurve && <p className="mt-3 text-[11px] text-white/35">{lightCurveNote(o.lightCurve, o.params.variability_type, lang)}</p>}
      <p className="mt-4 text-[11px] text-white/40">
        {t.object.sources}:{" "}
        {Object.entries(o.sources).map(([k, ref], i) => (
          <span key={k}>
            {i > 0 && ", "}
            {ref?.url ? (
              <a href={ref.url} target="_blank" rel="noreferrer" className="underline decoration-white/20 hover:text-white/70">
                {SOURCE_LABELS[k] ?? k}
              </a>
            ) : (
              (SOURCE_LABELS[k] ?? k)
            )}
          </span>
        ))}
      </p>
    </>
  );
}
