import { notFound } from "next/navigation";
import { HomeObjects, type HomeGroup } from "@/components/ui/HomeObjects";
import { isLang, pick } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { ObjectDto } from "@/lib/objects/dto";
import { getSkyObjects } from "@/lib/objects/queries";

const GROUPS: { key: "solar" | "stars" | "pulsars"; match: (o: ObjectDto) => boolean }[] = [
  { key: "solar", match: (o) => o.canonicalKey.startsWith("jpl:") },
  { key: "pulsars", match: (o) => o.type === "pulsar" },
  { key: "stars", match: () => true },
];
const ORDER = ["solar", "stars", "pulsars"];

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDictionary(lang);
  const objects = await getSkyObjects();
  const used = new Set<string>();
  const groups: HomeGroup[] = GROUPS.map((g) => {
    const items = objects.filter((o) => !used.has(o.slug) && g.match(o));
    items.forEach((o) => used.add(o.slug));
    return {
      key: g.key,
      title: t.home.groups[g.key],
      items: items.map((o) => ({ slug: o.slug, name: pick(o.names, lang, o.name), type: t.types[o.type] })),
    };
  })
    .filter((g) => g.items.length)
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

  return (
    <section className="pointer-events-auto mt-auto max-h-full w-full max-w-sm overflow-y-auto">
      <h1 className="text-2xl font-light tracking-tight">{t.home.title}</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">{t.home.tagline}</p>
      <HomeObjects groups={groups} label={t.home.objectsNav} />
    </section>
  );
}
