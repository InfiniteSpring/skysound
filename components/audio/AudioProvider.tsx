"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AudioEngine, AudioObject, NowPlaying } from "@/lib/audio/engine";
import type { GenreId } from "@/lib/audio/genres";

type Status = "locked" | "starting" | "playing" | "paused" | "unsupported";

interface AudioApi {
  status: Status;
  genre: GenreId;
  nowPlaying: NowPlaying | null;
  volume: number;
  /** Create the AudioContext. Call synchronously inside a click/keydown handler. */
  unlock(): void;
  play(object: AudioObject): Promise<void>;
  setGenre(genre: GenreId): void;
  toggle(): void;
  setVolume(v: number): void;
}

const AudioContextReact = createContext<AudioApi | null>(null);

const GENRE_KEY = "skysound:genre";
const VOLUME_KEY = "skysound:volume";

function readStored<T>(key: string, fallback: T, valid: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(key);
    const v = raw === null ? null : JSON.parse(raw);
    return valid(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: preference just isn't remembered */
  }
}

const isGenre = (v: unknown): v is GenreId => v === "ambient" || v === "lofi";
const isVolume = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<Promise<AudioEngine> | null>(null);
  const objectRef = useRef<AudioObject | null>(null);
  const [status, setStatus] = useState<Status>("locked");
  const [genre, setGenreState] = useState<GenreId>("ambient");
  const [volume, setVolumeState] = useState(0.8);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const genreRef = useRef(genre);
  const volumeRef = useRef(volume);

  useEffect(() => {
    // Preferences live in localStorage, which only exists after hydration.
    const g = readStored(GENRE_KEY, "ambient" as GenreId, isGenre);
    const v = readStored(VOLUME_KEY, 0.8, isVolume);
    genreRef.current = g;
    volumeRef.current = v;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from an external store
    setGenreState(g);
    setVolumeState(v);
    // Warm the engine chunk; this does not create an AudioContext.
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    idle(() => void import("@/lib/audio/engine"));
  }, []);

  const unlock = useCallback(() => {
    if (engineRef.current) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }
    // Created and resumed synchronously inside the user gesture, as autoplay policies require.
    const ctx = new Ctor({ latencyHint: "playback" });
    void ctx.resume();
    // Test/debug hook: lets smoke tests verify one context survives navigation.
    (window as unknown as { __skysoundAudio?: () => AudioContextState }).__skysoundAudio = () => ctx.state;
    setStatus("starting");
    engineRef.current = import("@/lib/audio/engine").then(({ AudioEngine }) => {
      const engine = new AudioEngine(ctx);
      engine.setVolume(volumeRef.current);
      return engine;
    });
  }, []);

  // First interaction anywhere unlocks audio, so later async plays (after a fetch) still work.
  useEffect(() => {
    const onFirst = () => unlock();
    window.addEventListener("pointerdown", onFirst, { once: true, capture: true });
    window.addEventListener("keydown", onFirst, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", onFirst, { capture: true });
      window.removeEventListener("keydown", onFirst, { capture: true });
    };
  }, [unlock]);

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const start = useCallback(async (object: AudioObject, g: GenreId) => {
    if (!engineRef.current) return;
    const engine = await engineRef.current;
    await engine.play(object, g);
    setNowPlaying(engine.nowPlaying);
    setStatus("playing");
  }, []);

  const play = useCallback(
    async (object: AudioObject) => {
      const same = objectRef.current?.slug === object.slug;
      objectRef.current = object;
      if (same && statusRef.current === "playing") return;
      if (same && statusRef.current === "paused") {
        (await engineRef.current)?.resume();
        setStatus("playing");
        return;
      }
      await start(object, genreRef.current);
    },
    [start],
  );

  const setGenre = useCallback(
    (g: GenreId) => {
      genreRef.current = g;
      setGenreState(g);
      store(GENRE_KEY, g);
      if (objectRef.current && engineRef.current) void start(objectRef.current, g);
    },
    [start],
  );

  const toggle = useCallback(async () => {
    const engine = await engineRef.current;
    if (!engine || !objectRef.current) return;
    if (statusRef.current === "playing") {
      engine.pause();
      setStatus("paused");
    } else if (engine.nowPlaying?.slug === objectRef.current.slug) {
      engine.resume();
      setStatus("playing");
    } else {
      await start(objectRef.current, genreRef.current);
    }
  }, [start]);

  const setVolume = useCallback((v: number) => {
    volumeRef.current = v;
    setVolumeState(v);
    store(VOLUME_KEY, v);
    void engineRef.current?.then((e) => e.setVolume(v));
  }, []);

  const api = useMemo<AudioApi>(
    () => ({ status, genre, nowPlaying, volume, unlock, play, setGenre, toggle, setVolume }),
    [status, genre, nowPlaying, volume, unlock, play, setGenre, toggle, setVolume],
  );

  return <AudioContextReact.Provider value={api}>{children}</AudioContextReact.Provider>;
}

export function useAudio() {
  const ctx = useContext(AudioContextReact);
  if (!ctx) throw new Error("useAudio must be used inside <AudioProvider>");
  return ctx;
}
