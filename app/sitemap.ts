import type { MetadataRoute } from "next";
import { getSkyObjects } from "@/lib/objects/queries";
import { siteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const objects = await getSkyObjects();
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    ...objects.map((o) => ({
      url: `${siteUrl}/object/${o.slug}`,
      lastModified: o.fetchedAt ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
