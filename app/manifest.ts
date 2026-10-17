import type { MetadataRoute } from "next";
import { getDictionary } from "@/lib/i18n/dictionaries";

export default function manifest(): MetadataRoute.Manifest {
  const t = getDictionary("en");
  return {
    name: t.siteName,
    short_name: "Cosmos",
    description: t.siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#02030a",
    theme_color: "#02030a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
