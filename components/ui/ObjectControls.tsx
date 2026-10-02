"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAudio } from "@/components/audio/AudioProvider";
import { useLang } from "@/components/i18n/LangProvider";
import { useSky } from "@/components/sky/SkyProvider";
import { fetchObject, ObjectFetchError } from "@/lib/client/api";
import type { ObjectDto } from "@/lib/objects/dto";

/** "Listen" on a server-rendered object page. */
export function ListenButton({ object }: { object: ObjectDto }) {
  const audio = useAudio();
  const sky = useSky();
  const { t } = useLang();
  const current = audio.nowPlaying?.slug === object.slug && audio.status === "playing";

  useEffect(() => {
    // Objects can be opened by URL before the sky list knows them.
    if (!sky.objects.some((o) => o.slug === object.slug)) sky.upsert(object);
  }, [object, sky]);

  return (
    <button
      type="button"
      onClick={() => {
        audio.unlock();
        if (current) audio.toggle();
        else void audio.play(object);
      }}
      className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:scale-[1.03]"
      data-testid="listen"
    >
      {current ? t.object.pause : t.object.listen}
    </button>
  );
}

/**
 * Shown on /object/[slug] when the object is not in the DB yet: asks the API to pull it
 * from the catalogs, then re-renders the server page with the stored data.
 */
export function ObjectLoader({ slug }: { slug: string }) {
  const router = useRouter();
  const sky = useSky();
  const { t, href } = useLang();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchObject(slug, { signal: ctrl.signal })
      .then((obj) => {
        sky.upsert(obj);
        if (obj.slug !== slug) router.replace(href(`/object/${obj.slug}`));
        else router.refresh();
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) setError(err instanceof ObjectFetchError ? t.errors[err.kind] : t.errors.generic);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per slug
  }, [slug]);

  return (
    <div className="text-sm text-white/70" data-testid="object-loader">
      {error ?? (
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
          {t.object.loading}
        </span>
      )}
    </div>
  );
}
