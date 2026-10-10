"use client";

import { useEffect, useRef } from "react";
import { useAudio } from "@/components/audio/AudioProvider";
import { useLang } from "@/components/i18n/LangProvider";
import { useSky } from "@/components/sky/SkyProvider";
import { GENRE_LIST } from "@/lib/audio/genres";
import { midiToName } from "@/lib/audio/theory";
import { AboutButton } from "./About";

const skipBtn =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-30";

/** Phones: transport, title and About on the first row, genres underneath. One row from `sm` up. */
export function PlayerBar() {
  const audio = useAudio();
  const sky = useSky();
  const { t, nameOf } = useLang();
  const playing = audio.status === "playing";
  const music = audio.nowPlaying?.music;
  // The engine knows the slug; the name follows the interface language.
  const nowObject = audio.nowPlaying ? sky.objects.find((o) => o.slug === audio.nowPlaying!.slug) : undefined;
  const nowName = nowObject ? nameOf(nowObject) : audio.nowPlaying?.name;

  const onPlay = () => {
    audio.unlock();
    if (audio.nowPlaying) {
      audio.toggle();
      return;
    }
    const object = sky.selected ?? sky.objects.find((o) => o.slug === "sun") ?? sky.objects[0];
    if (!object) return;
    if (sky.selected) void audio.play(object);
    else sky.select(object);
  };

  // Space plays / pauses anywhere, unless a control that uses Space itself has focus.
  const onPlayRef = useRef(onPlay);
  useEffect(() => {
    onPlayRef.current = onPlay;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, button, [contenteditable], [role=radio], [role=tab], [role=switch], [role=slider]")) return;
      e.preventDefault(); // no page scroll
      onPlayRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="pointer-events-auto w-full">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl border border-white/10 bg-[#0b0d18]/50 px-2.5 py-2 backdrop-blur-md sm:flex-nowrap sm:gap-x-3 sm:px-3">
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={sky.prev}
            disabled={audio.status === "unsupported" || !sky.objects.length}
            aria-label={t.player.prev}
            data-testid="prev-track"
            className={skipBtn}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="rtl:-scale-x-100">
              <rect x="1" y="1.5" width="1.6" height="9" rx="0.6" fill="currentColor" />
              <path d="M10.5 1.9v8.2a.5.5 0 0 1-.78.42L3.9 6.42a.5.5 0 0 1 0-.84l5.82-4.1a.5.5 0 0 1 .78.42Z" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onPlay}
            disabled={audio.status === "unsupported"}
            aria-label={playing ? t.player.pause : t.player.play}
            data-testid="play-toggle"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 disabled:opacity-40"
          >
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
                <rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M3 1.5v11a.5.5 0 0 0 .77.42l8.5-5.5a.5.5 0 0 0 0-.84l-8.5-5.5A.5.5 0 0 0 3 1.5Z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={sky.next}
            disabled={audio.status === "unsupported" || !sky.objects.length}
            aria-label={t.player.next}
            data-testid="next-track"
            className={skipBtn}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="rtl:-scale-x-100">
              <rect x="9.4" y="1.5" width="1.6" height="9" rx="0.6" fill="currentColor" />
              <path d="M1.5 1.9v8.2a.5.5 0 0 0 .78.42l5.82-4.1a.5.5 0 0 0 0-.84L2.28 1.48a.5.5 0 0 0-.78.42Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div className="min-w-0 flex-1 px-1" aria-live="polite">
          {sky.loading ? (
            <div className="flex items-center gap-2 text-sm text-white/80" data-testid="loading-indicator">
              <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-white/30 border-t-white" />
              <span className="truncate">{t.player.loading(sky.loading.name)}</span>
            </div>
          ) : sky.error ? (
            <button type="button" onClick={sky.dismissError} className="truncate text-start text-sm text-amber-300/90">
              {t.errors[sky.error]} ✕
            </button>
          ) : audio.nowPlaying ? (
            <>
              <div className="truncate text-sm text-white" data-testid="now-playing">
                {nowName}
              </div>
              {music && (
                <div className="truncate text-xs text-white/45">
                  {music.bpm} BPM · {midiToName(music.rootMidi).replace(/\d/, "")} {t.player.scales[music.scale]} · {t.player.reverb}{" "}
                  {music.reverbDecay} {t.player.sec}
                </div>
              )}
            </>
          ) : (
            <div className="truncate text-sm text-white/55">{audio.status === "unsupported" ? t.player.unsupported : t.player.pick}</div>
          )}
        </div>

        <div
          role="radiogroup"
          aria-label={t.player.genre}
          className="order-last flex w-full shrink-0 rounded-full bg-white/5 p-0.5 text-xs sm:order-none sm:w-auto"
        >
          {GENRE_LIST.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={audio.genre === g.id}
              onClick={() => {
                audio.unlock();
                audio.setGenre(g.id);
              }}
              className={`flex-1 whitespace-nowrap rounded-full px-2 py-1.5 transition sm:flex-none sm:px-3 ${audio.genre === g.id ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
            >
              {g.label}
            </button>
          ))}
        </div>

        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={audio.volume}
          onChange={(e) => audio.setVolume(Number(e.target.value))}
          aria-label={t.player.volume}
          className="hidden w-24 accent-white sm:block"
        />

        <AboutButton />
      </div>
    </div>
  );
}
