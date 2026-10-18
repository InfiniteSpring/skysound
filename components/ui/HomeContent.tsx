"use client";

import { useAudio } from "@/components/audio/AudioProvider";
import { useLang } from "@/components/i18n/LangProvider";
import { useSky } from "@/components/sky/SkyProvider";
import { ObjectInfo } from "./ObjectInfo";
import { ObjectLink } from "./ObjectLink";

/**
 * Home page body. While something is playing (and the setting allows it) the home page shows
 * that object's card; otherwise — and always in the server HTML — the panel with object links.
 */
export function HomeContent({ children }: { children: React.ReactNode }) {
  const { settings, nowPlaying, status } = useAudio();
  const { objects } = useSky();
  const { lang, t, nameOf } = useLang();
  const object = settings.homeShowsTrack && nowPlaying ? objects.find((o) => o.slug === nowPlaying.slug) : undefined;
  if (!object) return children;

  return (
    <article
      className="pointer-events-auto mt-auto max-h-[min(36dvh,100%)] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 p-5 backdrop-blur-md sm:max-h-full"
      data-testid="home-track"
    >
      <p className="flex items-center gap-2 text-xs text-white/40">
        <span aria-hidden className={`eq flex h-3 items-end gap-[2px] ${status === "playing" ? "eq-on" : ""}`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="w-[2px] rounded-full bg-sky-200/70" />
          ))}
        </span>
        {t.home.nowPlaying}
      </p>
      <div className="mt-2">
        <ObjectInfo
          object={object}
          lang={lang}
          as="h2"
          nameNode={
            <ObjectLink slug={object.slug} name={nameOf(object)} className="transition hover:text-sky-200">
              {nameOf(object)}
            </ObjectLink>
          }
        />
      </div>
    </article>
  );
}
