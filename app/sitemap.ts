import type { MetadataRoute } from "next";
import { LANGS, localizePath } from "@/lib/i18n/config";
import { getSkyObjects } from "@/lib/objects/queries";
import { siteUrl } from "@/lib/site";

/** Every page in every language, each entry listing its language alternates. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const objects = await getSkyObjects();
  const entry = (path: string, extra: Partial<MetadataRoute.Sitemap[number]>) =>
    LANGS.map((lang) => ({
      url: `${siteUrl}${localizePath(path, lang)}`,
      alternates: { languages: Object.fromEntries(LANGS.map((l) => [l, `${siteUrl}${localizePath(path, l)}`])) },
      ...extra,
    }));
  return [
    ...entry("/", { changeFrequency: "weekly", priority: 1 }),
    ...objects.flatMap((o) =>
      entry(`/object/${o.slug}`, { lastModified: o.fetchedAt ?? undefined, changeFrequency: "monthly", priority: 0.7 }),
    ),
  ];
}
