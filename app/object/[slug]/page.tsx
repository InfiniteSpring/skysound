import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { ListenButton, ObjectLoader } from "@/components/ui/ObjectControls";
import type { ObjectDto } from "@/lib/objects/dto";
import { getPageObject } from "@/lib/objects/queries";
import { SEED_SLUGS } from "@/lib/seed";
import { isValidSlug } from "@/lib/slug";
import { formatDistance, formatPeriod, TYPE_LABELS_RU } from "@/lib/sources/normalize";

/** Seed objects are prerendered; every other slug renders on first visit and is cached. */
export function generateStaticParams() {
  return SEED_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/object/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = isValidSlug(slug) ? await getPageObject(slug) : null;
  if (page?.kind !== "ready") return { title: "Объект", robots: { index: false } };
  const o = page.object;
  const title = `${o.name} — ${TYPE_LABELS_RU[o.type]}`;
  return {
    title,
    description: o.description,
    alternates: { canonical: `/object/${o.slug}` },
    openGraph: { title, description: o.description, url: `/object/${o.slug}`, type: "article" },
    twitter: { card: "summary", title, description: o.description },
  };
}

const SOURCE_LABELS: Record<string, string> = {
  simbad: "SIMBAD",
  gaia: "Gaia DR3",
  atnf: "ATNF Pulsar Catalogue",
  vsx: "AAVSO VSX",
  jpl: "JPL Horizons",
};

function facts(o: ObjectDto): [string, string][] {
  const p = o.params;
  const rows: [string, string | undefined][] = [
    ["Тип", TYPE_LABELS_RU[o.type]],
    ["Спектральный класс", p.spectral_type],
    ["Тип переменности", p.variability_type],
    [o.type === "pulsar" ? "Период вращения" : o.type === "variable_star" ? "Период блеска" : "Период вращения", p.period_s ? formatPeriod(p.period_s) : undefined],
    ["Орбитальный период", p.orbital_period_days ? formatPeriod(p.orbital_period_days * 86400) : undefined],
    ["Температура", p.temperature_k ? `${Math.round(p.temperature_k).toLocaleString("ru-RU")} K` : undefined],
    ["Светимость", p.luminosity ? `${Number(p.luminosity.toPrecision(3)).toLocaleString("ru-RU")} L☉` : undefined],
    ["Расстояние", p.distance_ly ? formatDistance(p.distance_ly) : undefined],
    ["Видимая звёздная величина", p.magnitude_v !== undefined ? String(p.magnitude_v) : undefined],
    ["Амплитуда", p.amplitude_mag ? `${p.amplitude_mag} зв. вел.` : undefined],
    ["Координаты (RA, Dec)", `${o.position.ra_deg.toFixed(3)}°, ${o.position.dec_deg.toFixed(3)}°`],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
}

async function ObjectPanel({ params }: { params: PageProps<"/object/[slug]">["params"] }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const page = await getPageObject(slug);

  if (page.kind === "alias") permanentRedirect(`/object/${page.target}`);
  if (page.kind === "failed" && page.notFound) notFound();
  if (page.kind !== "ready") {
    return (
      <Panel>
        <h1 className="text-2xl font-light">{slug.replace(/-/g, " ")}</h1>
        <div className="mt-4">
          <ObjectLoader slug={slug} />
        </div>
      </Panel>
    );
  }

  const o = page.object;
  return (
    <Panel>
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">{TYPE_LABELS_RU[o.type]}</p>
      <h1 className="mt-1 text-2xl font-light sm:text-3xl" data-testid="object-name">
        {o.name}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-white/70">{o.description}</p>
      <div className="mt-4">
        <ListenButton object={o} />
      </div>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        {facts(o).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-white/40">{k}</dt>
            <dd className="text-white/80">{v}</dd>
          </div>
        ))}
      </dl>
      {o.lightCurve && <p className="mt-3 text-[11px] text-white/35">{o.lightCurve.note}</p>}
      <p className="mt-4 text-[11px] text-white/40">
        Данные:{" "}
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

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <article className="pointer-events-auto mt-auto max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0d18]/75 p-5 backdrop-blur-md">
      <Link href="/" scroll={false} className="text-xs text-white/40 hover:text-white/70">
        ← Всё небо
      </Link>
      <div className="mt-2">{children}</div>
    </article>
  );
}

export default function ObjectPage({ params }: PageProps<"/object/[slug]">) {
  return (
    <Suspense
      fallback={
        <Panel>
          <div className="h-24 animate-pulse rounded-lg bg-white/5" />
        </Panel>
      }
    >
      <ObjectPanel params={params} />
    </Suspense>
  );
}
