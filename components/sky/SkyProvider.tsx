"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAudio } from "@/components/audio/AudioProvider";
import { fetchObject, ObjectFetchError } from "@/lib/client/api";
import type { ObjectDto } from "@/lib/objects/dto";

export interface SelectTarget {
  slug: string;
  name: string;
  /** Catalog ref for objects not stored yet (from search). */
  ref?: string;
}

interface SkyApi {
  objects: ObjectDto[];
  selected: ObjectDto | null;
  /** An object being pulled from catalogs right now. Music keeps playing meanwhile. */
  loading: SelectTarget | null;
  error: string | null;
  select(target: SelectTarget | ObjectDto): void;
  dismissError(): void;
  upsert(object: ObjectDto): void;
}

const SkyContext = createContext<SkyApi | null>(null);

const slugFromPath = (path: string) => path.match(/^\/object\/([^/?#]+)/)?.[1] ?? null;

export function SkyProvider({ initialObjects, children }: { initialObjects: ObjectDto[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const audio = useAudio();
  const [added, setAdded] = useState<ObjectDto[]>([]);
  const [loading, setLoading] = useState<SelectTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Set by explicit clicks: a chosen object plays even if the user had paused. */
  const intentRef = useRef(false);

  // Server list (refreshed by revalidation) plus anything fetched in this session.
  const objects = useMemo(() => {
    const bySlug = new Map(initialObjects.map((o) => [o.slug, o]));
    for (const o of added) bySlug.set(o.slug, o);
    return [...bySlug.values()];
  }, [initialObjects, added]);

  const selectedSlug = slugFromPath(pathname);
  const selected = useMemo(() => objects.find((o) => o.slug === selectedSlug) ?? null, [objects, selectedSlug]);

  const upsert = useCallback((o: ObjectDto) => setAdded((xs) => [...xs.filter((x) => x.slug !== o.slug), o]), []);

  const select = useCallback(
    (target: SelectTarget | ObjectDto) => {
      audio.unlock(); // inside the click: lets audio start even after an async fetch
      intentRef.current = true;
      setError(null);
      const known = objects.find((o) => o.slug === target.slug);
      if (known) {
        abortRef.current?.abort();
        setLoading(null);
        router.push(`/object/${known.slug}`, { scroll: false });
        return;
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading({ slug: target.slug, name: target.name });
      fetchObject(target.slug, "ref" in target ? target.ref : undefined, ctrl.signal)
        .then((obj) => {
          upsert(obj);
          router.push(`/object/${obj.slug}`, { scroll: false });
        })
        .catch((err) => {
          if (ctrl.signal.aborted) return;
          setError(err instanceof ObjectFetchError ? err.message : "Не удалось загрузить объект");
        })
        .finally(() => {
          if (abortRef.current === ctrl) setLoading(null);
        });
    },
    [audio, objects, router, upsert],
  );

  // The URL is the source of truth for selection; music follows it (clicks, search, back/forward).
  const { play, status, nowPlaying } = audio;
  const unlocked = status !== "locked" && status !== "unsupported";
  useEffect(() => {
    if (!unlocked || !selected) return;
    const intent = intentRef.current;
    intentRef.current = false;
    if (nowPlaying?.slug === selected.slug || (status === "paused" && !intent)) return;
    void play(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to selection/unlock, not to every status flip
  }, [selected?.slug, unlocked]);

  const api = useMemo<SkyApi>(
    () => ({ objects, selected, loading, error, select, dismissError: () => setError(null), upsert }),
    [objects, selected, loading, error, select, upsert],
  );
  return <SkyContext.Provider value={api}>{children}</SkyContext.Provider>;
}

export function useSky() {
  const ctx = useContext(SkyContext);
  if (!ctx) throw new Error("useSky must be used inside <SkyProvider>");
  return ctx;
}
