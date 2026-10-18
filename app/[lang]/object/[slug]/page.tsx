import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { JsonLd } from "@/components/JsonLd";
import { ObjectInfo, objectTexts } from "@/components/ui/ObjectInfo";
import { siteUrl } from "@/lib/site";
import { ObjectLoader } from "@/components/ui/ObjectControls";
import { isLang, LANGS, localizePath } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getPageObject } from "@/lib/objects/queries";
import { SEED_SLUGS } from "@/lib/seed";
import { isValidSlug } from "@/lib/slug";

/** Seed objects are prerendered (in every language); other slugs render on first visit and are cached. */
export function generateStaticParams() {
  return SEED_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/object/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLang(lang)) return {};
  const t = getDictionary(lang);
  const page = isValidSlug(slug) ? await getPageObject(slug) : null;
  if (page?.kind !== "ready") return { title: t.object.fallbackTitle, robots: { index: false } };
  const o = page.object;
  const { name, description } = objectTexts(o, lang);
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
    twitter: { card: "summary_large_image", title, description },
  };
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
  const { name, description } = objectTexts(o, lang);
  return (
    <Panel back={t.object.back} home={localizePath("/", lang)}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Thing",
          name,
          alternateName: o.name !== name ? o.name : undefined,
          description,
          url: `${siteUrl}${localizePath(`/object/${o.slug}`, lang)}`,
          sameAs: Object.values(o.sources).flatMap((ref) => (ref?.url ? [ref.url] : [])),
          inLanguage: lang,
        }}
      />
      <ObjectInfo object={o} lang={lang} />
    </Panel>
  );
}

function Panel({ children, back, home }: { children: React.ReactNode; back: string; home: string }) {
  return (
    <article className="pointer-events-auto mt-auto max-h-[min(36dvh,100%)] w-full max-w-sm overflow-y-auto rounded-2xl sm:max-h-full border border-white/10 p-5 backdrop-blur-md">
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
        <article className="pointer-events-auto mt-auto w-full max-w-sm rounded-2xl border border-white/10 p-5 backdrop-blur-md">
          <div className="h-24 animate-pulse rounded-lg bg-white/5" />
        </article>
      }
    >
      <ObjectPanel params={params} />
    </Suspense>
  );
}
