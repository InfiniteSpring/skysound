import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { notFound } from "next/navigation";
import { AudioProvider } from "@/components/audio/AudioProvider";
import { LangProvider } from "@/components/i18n/LangProvider";
import { LangSwitch } from "@/components/i18n/LangSwitch";
import { SkyBackground } from "@/components/scene/SkyBackground";
import { SkyProvider } from "@/components/sky/SkyProvider";
import { PlayerBar } from "@/components/ui/PlayerBar";
import { SearchBox } from "@/components/ui/SearchBox";
import { SettingsPanel } from "@/components/ui/SettingsPanel";
import { Brand } from "@/components/ui/Brand";
import { BottomDock } from "@/components/ui/BottomDock";
import { AboutButton, AboutProvider, AboutPush, AboutSheet } from "@/components/ui/About";
import { dirOf, HTML_LOCALE, isLang, LANGS, localizePath } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getSkyObjects } from "@/lib/objects/queries";
import { siteUrl } from "@/lib/site";
import { JsonLd } from "@/components/JsonLd";
import "../globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin", "cyrillic"] });

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDictionary(lang);
  return {
    metadataBase: new URL(siteUrl),
    applicationName: t.siteName,
    title: { default: t.siteName, template: `%s · ${t.siteName}` },
    description: t.siteDescription,
    alternates: {
      canonical: localizePath("/", lang),
      languages: { ...Object.fromEntries(LANGS.map((l) => [l, localizePath("/", l)])), "x-default": "/" },
    },
    openGraph: {
      type: "website",
      siteName: t.siteName,
      title: t.siteName,
      description: t.siteDescription,
      url: localizePath("/", lang),
      locale: HTML_LOCALE[lang],
      alternateLocale: LANGS.filter((l) => l !== lang).map((l) => HTML_LOCALE[l]),
    },
    twitter: { card: "summary_large_image", title: t.siteName, description: t.siteDescription },
  };
}

export const viewport: Viewport = { themeColor: "#02030a", colorScheme: "dark" };

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const objects = await getSkyObjects();
  return (
    <html lang={lang} dir={dirOf(lang)} className={`${geist.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden bg-[#02030a] font-sans text-white">
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: getDictionary(lang).siteName,
            description: getDictionary(lang).siteDescription,
            url: `${siteUrl}${localizePath("/", lang)}`,
            inLanguage: lang,
            applicationCategory: "MultimediaApplication",
            operatingSystem: "Any (web browser)",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }}
        />
        <LangProvider lang={lang}>
          <AudioProvider>
            <SkyProvider initialObjects={objects}>
              <AboutProvider>
                <SkyBackground />
                <AboutPush>
                  <div className="pointer-events-none fixed inset-0 z-10 flex flex-col">
                    <header className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                      <Brand />
                      <div className="flex flex-1 items-center justify-end gap-2">
                        <SearchBox />
                        <LangSwitch />
                      </div>
                    </header>
                    <main className="flex min-h-0 flex-1 flex-col px-3 pb-[calc(var(--dock-h,9rem)+0.25rem)] sm:px-4 lg:pb-24">{children}</main>
                  </div>
                  <BottomDock>
                    <SettingsPanel />
                    <div className="flex w-full items-stretch justify-center gap-2">
                      <PlayerBar />
                      <AboutButton />
                    </div>
                  </BottomDock>
                </AboutPush>
                <AboutSheet />
              </AboutProvider>
            </SkyProvider>
          </AudioProvider>
        </LangProvider>
      </body>
    </html>
  );
}
