"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAudio, type SwitchOrder } from "@/components/audio/AudioProvider";
import { useLang } from "@/components/i18n/LangProvider";
import { splitLocale } from "@/lib/i18n/config";
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
  error: ObjectFetchError["kind"] | "generic" | null;
  /** Seconds until auto-switch moves on, or null when auto-switch is off / nothing plays. */
  nextSwitchIn: number | null;
  select(target: SelectTarget | ObjectDto): void;
  /** Back to the whole sky (keeps the music playing). */
  goHome(): void;
  dismissError(): void;
  upsert(object: ObjectDto): void;
}

const SkyContext = createContext<SkyApi | null>(null);

const slugFromPath = (pathname: string) => splitLocale(pathname).path.match(/^\/object\/([^/?#]+)/)?.[1] ?? null;

/** Pick the next object for auto-switch. */
export function pickNext(objects: ObjectDto[], current: ObjectDto | null, order: SwitchOrder, random = Math.random): ObjectDto | null {
  const others = objects.filter((o) => o.slug !== current?.slug);
  if (!others.length) return null;
  if (order === "sequential") {
    const i = current ? objects.findIndex((o) => o.slug === current.slug) : -1;
    return objects[(i + 1) % objects.length];
  }
  const pool = order === "same_type" && current ? others.filter((o) => o.type === current.type) : others;
  const from = pool.length ? pool : others;
  return from[Math.floor(random() * from.length)];
}

export function SkyProvider({ initialObjects, children }: { initialObjects: ObjectDto[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const audio = useAudio();
  const { href, lang } = useLang();
  const [added, setAdded] = useState<ObjectDto[]>([]);
  const [loading, setLoading] = useState<SelectTarget | null>(null);
  const [error, setError] = useState<SkyApi["error"]>(null);
  /**
   * Optimistic selection: the camera and music react to a click immediately, while the
   * route (and its server render) catches up. It only applies while the path is unchanged,
   * so back/forward navigation always wins.
   */
  const [pending, setPending] = useState<{ slug: string | null; fromPath: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Server list (refreshed by revalidation) plus anything fetched in this session.
  const objects = useMemo(() => {
    const bySlug = new Map(initialObjects.map((o) => [o.slug, o]));
    for (const o of added) bySlug.set(o.slug, o);
    return [...bySlug.values()];
  }, [initialObjects, added]);

  const selectedSlug = pending && pending.fromPath === pathname ? pending.slug : slugFromPath(pathname);
  const selected = useMemo(() => objects.find((o) => o.slug === selectedSlug) ?? null, [objects, selectedSlug]);

  const upsert = useCallback((o: ObjectDto) => setAdded((xs) => [...xs.filter((x) => x.slug !== o.slug), o]), []);

  const { play, unlock } = audio;
  const go = useCallback(
    (o: ObjectDto) => {
      setPending({ slug: o.slug, fromPath: pathname });
      void play(o); // don't wait for navigation: in dev a route compile can take seconds
      router.push(href(`/object/${o.slug}`), { scroll: false });
    },
    [pathname, play, router, href],
  );

  const goHome = useCallback(() => {
    if (!slugFromPath(pathname) && !pending?.slug) return;
    setPending({ slug: null, fromPath: pathname });
    router.push(href("/"), { scroll: false });
  }, [pathname, pending, router, href]);

  const select = useCallback(
    (target: SelectTarget | ObjectDto) => {
      unlock(); // inside the click: lets audio start even after an async fetch
      setError(null);
      abortRef.current?.abort();
      const known = objects.find((o) => o.slug === target.slug);
      if (known) {
        setLoading(null);
        go(known);
        return;
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading({ slug: target.slug, name: target.name });
      fetchObject(target.slug, { ref: "ref" in target ? target.ref : undefined, name: target.name, lang, signal: ctrl.signal })
        .then((obj) => {
          upsert(obj);
          go(obj);
        })
        .catch((err) => {
          if (ctrl.signal.aborted) return;
          setError(err instanceof ObjectFetchError ? err.kind : "generic");
        })
        .finally(() => {
          if (abortRef.current === ctrl) setLoading(null);
        });
    },
    [unlock, objects, go, upsert, lang],
  );

  // Escape returns to the whole sky, like a click on empty space.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "Escape" || el?.closest("input, textarea, [role=combobox]")) return;
      goHome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goHome]);

  // Music follows the URL too: direct visits after unlock, back/forward (a pause is respected).
  const { status, requestedSlug } = audio;
  const unlocked = status !== "locked" && status !== "unsupported";
  useEffect(() => {
    if (!unlocked || !selected || status === "paused") return;
    if (requestedSlug() === selected.slug) return;
    void play(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to selection/unlock, not to every status flip
  }, [selected?.slug, unlocked]);

  // Auto-switch: count listening time (only while playing) and move on when it runs out.
  const { settings, nowPlaying } = audio;
  const [elapsed, setElapsed] = useState({ slug: "", seconds: 0 });
  const playingSlug = status === "playing" ? (nowPlaying?.slug ?? null) : null;
  const latest = useRef({ objects, go, settings });
  useEffect(() => {
    latest.current = { objects, go, settings };
  });
  useEffect(() => {
    if (!settings.autoSwitch || !playingSlug) return;
    let seconds = elapsed.slug === playingSlug ? elapsed.seconds : 0;
    const id = setInterval(() => {
      seconds += 1;
      setElapsed({ slug: playingSlug, seconds });
      const { objects: all, go: goTo, settings: s } = latest.current;
      if (seconds < s.switchMinutes * 60) return;
      clearInterval(id);
      const next = pickNext(all, all.find((o) => o.slug === playingSlug) ?? null, s.switchOrder);
      if (next) goTo(next);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the playing track or the toggle changes
  }, [settings.autoSwitch, playingSlug]);

  const listened = elapsed.slug === nowPlaying?.slug ? elapsed.seconds : 0;
  const nextSwitchIn = settings.autoSwitch && nowPlaying ? Math.max(0, settings.switchMinutes * 60 - listened) : null;

  const api = useMemo<SkyApi>(
    () => ({ objects, selected, loading, error, nextSwitchIn, select, goHome, dismissError: () => setError(null), upsert }),
    [objects, selected, loading, error, nextSwitchIn, select, goHome, upsert],
  );
  return <SkyContext.Provider value={api}>{children}</SkyContext.Provider>;
}

export function useSky() {
  const ctx = useContext(SkyContext);
  if (!ctx) throw new Error("useSky must be used inside <SkyProvider>");
  return ctx;
}
