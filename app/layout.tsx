import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { AudioProvider } from "@/components/audio/AudioProvider";
import { SkyBackground } from "@/components/scene/SkyBackground";
import { SkyProvider } from "@/components/sky/SkyProvider";
import { PlayerBar } from "@/components/ui/PlayerBar";
import { SearchBox } from "@/components/ui/SearchBox";
import { getSkyObjects } from "@/lib/objects/queries";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Музыка космоса", template: "%s · Музыка космоса" },
  description:
    "Интерактивная карта неба, где каждая планета, пульсар и переменная звезда звучит по-своему: музыка генерируется из реальных научных данных.",
  openGraph: { type: "website", siteName: "Музыка космоса", locale: "ru_RU" },
};

export const viewport: Viewport = { themeColor: "#02030a", colorScheme: "dark" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const objects = await getSkyObjects();
  return (
    <html lang="ru" className={`${geist.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden bg-[#02030a] font-sans text-white">
        <AudioProvider>
          <SkyProvider initialObjects={objects}>
            <SkyBackground />
            <div className="pointer-events-none fixed inset-0 z-10 flex flex-col">
              <header className="flex items-center gap-4 p-3 sm:p-4">
                <Link
                  href="/"
                  className="pointer-events-auto shrink-0 text-sm font-medium tracking-[0.2em] text-white/80 uppercase hover:text-white"
                >
                  Музыка космоса
                </Link>
                <div className="flex flex-1 justify-end">
                  <SearchBox />
                </div>
              </header>
              <main className="flex min-h-0 flex-1 flex-col px-3 pb-24 sm:px-4">{children}</main>
            </div>
            <PlayerBar />
          </SkyProvider>
        </AudioProvider>
      </body>
    </html>
  );
}
