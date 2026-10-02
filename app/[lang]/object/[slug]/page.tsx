import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { ListenButton, ObjectLoader } from "@/components/ui/ObjectControls";
import { isLang, LANGS, localizePath, pick, type Lang } from "@/lib/i18n/config";
import { describe, formatDistance, formatPeriod, lightCurveNote } from "@/lib/i18n/describe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { ObjectDto } from "@/lib/objects/dto";
import { getPageObject } from "@/lib/objects/queries";
import { SEED_SLUGS } from "@/lib/seed";
import { isValidSlug } from "@/lib/slug";

/** Seed objects are prerendered (in every language); other slugs render on first visit and are cached. */
export function generateStaticParams() {
  return SEED_SLUGS.map((slug) => ({ slug }));
}

function texts(o: ObjectDto, lang: Lang) {
  const name = pick(o.names, lang, o.name);
  return { name, description: o.descriptions[lang] ?? describe(o, name, lang) };
}

export async function generateMetadata({ params }: PageProps<"/[lang]/object/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLang(lang)) return {};
  const t = getDictionary(lang);
  const page = isValidSlug(slug) ? await getPageObject(slug) : null;
  if (page?.kind !== "ready") return { title: t.object.fallbackTitle, robots: { index: false } };
  const o = page.object;
  const { name, description } = texts(o, lang);
  const title = `${name} — ${t.types[o.type]}`;
  const path = `/object/${o.slug}`;
  return {
    title,
    description,
    alternates: {
      canonical: localizePath(path, lang),
      languages: Object.fromEntries(LANGS.map((l) => [l, localizePath(path, l)])),
    },
    openGraph: { title, description, url: localizePath(path, lang), type: "article" },
    twitter: { card: "summary", title, description },
  };
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

async function ObjectPanel({ params }: { params: PageProps<"/[lang]/object/[slug]">["params"] }) {
  const { lang, slug } = await params;
  if (!isLang(lang) || !isValidSlug(slug)) notFound();
  const t = getDictionary(lang);
  const page = await getPageObject(slug);

  if (page.kind === "alias") permanentRedirect(localizePath(`/object/${page.target}`, lang));
  if (page.kind === "failed" && page.notFound) notFound();
  if (page.kind !== "ready") {
    return (
      <Panel back={t.object.back} home={localizePath("/", lang)}>
        <h1 className="text-2xl font-light">{slug.replace(/-/g, " ")}</h1>
        <div className="mt-4">
          <ObjectLoader slug={slug} />
        </div>
      </Panel>
    );
  }

  const o = page.object;
  const { name, description } = texts(o, lang);
  return (
    <Panel back={t.object.back} home={localizePath("/", lang)}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">{t.types[o.type]}</p>
      <h1 className="mt-1 text-2xl font-light sm:text-3xl" data-testid="object-name">
        {name}
      </h1>
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
      {o.lightCurve && (
        <p className="mt-3 text-[11px] text-white/35">{lightCurveNote(o.lightCurve, o.params.variability_type, lang)}</p>
      )}
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
    </Panel>
  );
}

function Panel({ children, back, home }: { children: React.ReactNode; back: string; home: string }) {
  return (
    <article className="pointer-events-auto mt-auto max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0d18]/75 p-5 backdrop-blur-md">
      <Link href={home} scroll={false} className="text-xs text-white/40 hover:text-white/70">
        {back}
      </Link>
      <div className="mt-2">{children}</div>
    </article>
  );
}

export default function ObjectPage({ params }: PageProps<"/[lang]/object/[slug]">) {
  return (
    <Suspense
      fallback={
        <article className="pointer-events-auto mt-auto w-full max-w-sm rounded-2xl border border-white/10 bg-[#0b0d18]/75 p-5 backdrop-blur-md">
          <div className="h-24 animate-pulse rounded-lg bg-white/5" />
        </article>
      }
    >
      <ObjectPanel params={params} />
    </Suspense>
  );
}
