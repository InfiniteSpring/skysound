"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AudioEngine, AudioObject, NowPlaying } from "@/lib/audio/engine";
import { GENRES, type GenreId } from "@/lib/audio/genres";

type Status = "locked" | "starting" | "playing" | "paused" | "unsupported";

export type SwitchOrder = "random" | "sequential" | "same_type";

export interface AudioSettings {
  /** Crossfade between tracks, seconds. */
  crossfadeS: number;
  /** Move to another object automatically after `switchMinutes` of listening. */
  autoSwitch: boolean;
  switchMinutes: number;
  switchOrder: SwitchOrder;
  /** Magnify the selected object into its close-up (off: the camera only turns to it). */
  zoomOnSelect: boolean;
  /** On the home page, show the playing object's card instead of the object list. */
  homeShowsTrack: boolean;
}

export const DEFAULT_SETTINGS: AudioSettings = {
  crossfadeS: 3,
  autoSwitch: false,
  switchMinutes: 10,
  switchOrder: "random",
  zoomOnSelect: false,
  homeShowsTrack: true,
};

interface AudioApi {
  status: Status;
  genre: GenreId;
  nowPlaying: NowPlaying | null;
  volume: number;
  settings: AudioSettings;
  /** Create the AudioContext. Call synchronously inside a click/keydown handler. */
  unlock(): void;
  play(object: AudioObject): Promise<void>;
  /** Slug of the most recently requested object (set before the engine has switched). */
  requestedSlug(): string | null;
  setGenre(genre: GenreId): void;
  toggle(): void;
  setVolume(v: number): void;
  updateSettings(patch: Partial<AudioSettings>): void;
}

const AudioContextReact = createContext<AudioApi | null>(null);

/**
 * The engine outlives the provider: switching language swaps the root layout, and the
 * music (one AudioContext, one transport) must keep playing and stay controllable.
 */
const shared: { engine: Promise<AudioEngine> | null; object: AudioObject | null } = { engine: null, object: null };

const GENRE_KEY = "skysound:genre";
const VOLUME_KEY = "skysound:volume";
const SETTINGS_KEY = "skysound:audio-settings";

function readStored(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: preference just isn't remembered */
  }
}

const isGenre = (v: unknown): v is GenreId => typeof v === "string" && v in GENRES;
const isVolume = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;

export function sanitizeSettings(v: unknown): AudioSettings {
  const s = (v && typeof v === "object" ? v : {}) as Partial<AudioSettings>;
  const num = (x: unknown, lo: number, hi: number, d: number) =>
    typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
  return {
    crossfadeS: num(s.crossfadeS, 0.5, 10, DEFAULT_SETTINGS.crossfadeS),
    autoSwitch: typeof s.autoSwitch === "boolean" ? s.autoSwitch : DEFAULT_SETTINGS.autoSwitch,
    switchMinutes: num(s.switchMinutes, 1, 60, DEFAULT_SETTINGS.switchMinutes),
    switchOrder: ["random", "sequential", "same_type"].includes(s.switchOrder as string)
      ? (s.switchOrder as SwitchOrder)
      : DEFAULT_SETTINGS.switchOrder,
    zoomOnSelect: typeof s.zoomOnSelect === "boolean" ? s.zoomOnSelect : DEFAULT_SETTINGS.zoomOnSelect,
    homeShowsTrack: typeof s.homeShowsTrack === "boolean" ? s.homeShowsTrack : DEFAULT_SETTINGS.homeShowsTrack,
  };
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("locked");
  const [genre, setGenreState] = useState<GenreId>("ambient");
  const [volume, setVolumeState] = useState(0.8);
  const [settings, setSettings] = useState<AudioSettings>(DEFAULT_SETTINGS);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const genreRef = useRef(genre);
  const volumeRef = useRef(volume);
  const settingsRef = useRef(settings);
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    // Preferences live in localStorage, which only exists after hydration.
    const g = readStored(GENRE_KEY);
    const v = readStored(VOLUME_KEY);
    const s = sanitizeSettings(readStored(SETTINGS_KEY));
    if (isGenre(g)) genreRef.current = g;
    if (isVolume(v)) volumeRef.current = v;
    settingsRef.current = s;
    setGenreState(genreRef.current);
    setVolumeState(volumeRef.current);
    setSettings(s);
    // Warm the engine chunk; this does not create an AudioContext.
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    idle(() => void import("@/lib/audio/engine"));
    // Re-attach to music that kept playing across a remount (e.g. a language switch).
    void shared.engine?.then((engine) => {
      setNowPlaying(engine.nowPlaying);
      setStatus(engine.nowPlaying ? (engine.isPlaying ? "playing" : "paused") : "starting");
    });
  }, []);

  const unlock = useCallback(() => {
    if (shared.engine) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }
    // Created and resumed synchronously inside the user gesture, as autoplay policies require.
    const ctx = new Ctor({ latencyHint: "interactive" });
    void ctx.resume();
    // Test/debug hook: lets smoke tests verify one context survives navigation.
    (window as unknown as { __skysoundAudio?: () => AudioContextState }).__skysoundAudio = () => ctx.state;
    setStatus("starting");
    shared.engine = import("@/lib/audio/engine").then(({ AudioEngine }) => {
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

  const start = useCallback(async (object: AudioObject, g: GenreId) => {
    if (!shared.engine) return;
    const engine = await shared.engine;
    engine.play(object, g, settingsRef.current.crossfadeS);
    setNowPlaying(engine.nowPlaying);
    setStatus("playing");
  }, []);

  const play = useCallback(
    async (object: AudioObject) => {
      const same = shared.object?.slug === object.slug;
      shared.object = object;
      if (same && (statusRef.current === "playing" || statusRef.current === "starting") && shared.engine) {
        const engine = await shared.engine;
        if (engine.nowPlaying?.slug === object.slug && engine.isPlaying) return;
      }
      if (same && statusRef.current === "paused") {
        (await shared.engine)?.resume();
        setStatus("playing");
        return;
      }
      await start(object, genreRef.current);
    },
    [start],
  );

  const requestedSlug = useCallback(() => shared.object?.slug ?? null, []);

  const setGenre = useCallback(
    (g: GenreId) => {
      genreRef.current = g;
      setGenreState(g);
      store(GENRE_KEY, g);
      if (shared.object && shared.engine) void start(shared.object, g);
    },
    [start],
  );

  const toggle = useCallback(async () => {
    const engine = await shared.engine;
    if (!engine || !shared.object) return;
    if (statusRef.current === "playing") {
      engine.pause();
      setStatus("paused");
    } else if (engine.nowPlaying?.slug === shared.object.slug) {
      engine.resume();
      setStatus("playing");
    } else {
      await start(shared.object, genreRef.current);
    }
  }, [start]);

  const setVolume = useCallback((v: number) => {
    volumeRef.current = v;
    setVolumeState(v);
    store(VOLUME_KEY, v);
    void shared.engine?.then((e) => e.setVolume(v));
  }, []);

  const updateSettings = useCallback((patch: Partial<AudioSettings>) => {
    const next = sanitizeSettings({ ...settingsRef.current, ...patch });
    settingsRef.current = next;
    setSettings(next);
    store(SETTINGS_KEY, next);
  }, []);

  const api = useMemo<AudioApi>(
    () => ({
      status,
      genre,
      nowPlaying,
      volume,
      settings,
      unlock,
      play,
      requestedSlug,
      setGenre,
      toggle,
      setVolume,
      updateSettings,
    }),
    [status, genre, nowPlaying, volume, settings, unlock, play, requestedSlug, setGenre, toggle, setVolume, updateSettings],
  );

  return <AudioContextReact.Provider value={api}>{children}</AudioContextReact.Provider>;
}

export function useAudio() {
  const ctx = useContext(AudioContextReact);
  if (!ctx) throw new Error("useAudio must be used inside <AudioProvider>");
  return ctx;
}
