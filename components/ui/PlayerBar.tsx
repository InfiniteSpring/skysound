"use client";

import { useAudio } from "@/components/audio/AudioProvider";
import { useSky } from "@/components/sky/SkyProvider";
import { GENRE_LIST } from "@/lib/audio/genres";
import { midiToName } from "@/lib/audio/theory";

const SCALE_RU: Record<string, string> = {
  aeolian: "эолийский",
  dorian: "дорийский",
  mixolydian: "миксолидийский",
  major: "мажор",
  lydian: "лидийский",
};

export function PlayerBar() {
  const audio = useAudio();
  const sky = useSky();
  const playing = audio.status === "playing";
  const music = audio.nowPlaying?.music;

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

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-20 p-3 sm:p-4">
      <div className="mx-auto flex max-w-4xl items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0d18]/80 px-3 py-2 backdrop-blur-md sm:gap-4 sm:px-4">
        <button
          type="button"
          onClick={onPlay}
          disabled={audio.status === "unsupported"}
          aria-label={playing ? "Пауза" : "Играть"}
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

        <div className="min-w-0 flex-1" aria-live="polite">
          {sky.loading ? (
            <div className="flex items-center gap-2 text-sm text-white/80" data-testid="loading-indicator">
              <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-white/30 border-t-white" />
              <span className="truncate">Получаем «{sky.loading.name}» из научных каталогов…</span>
            </div>
          ) : sky.error ? (
            <button type="button" onClick={sky.dismissError} className="truncate text-left text-sm text-amber-300/90">
              {sky.error} ✕
            </button>
          ) : audio.nowPlaying ? (
            <>
              <div className="truncate text-sm text-white" data-testid="now-playing">
                {audio.nowPlaying.name}
              </div>
              {music && (
                <div className="truncate text-xs text-white/45">
                  {music.bpm} BPM · {midiToName(music.rootMidi).replace(/\d/, "")} {SCALE_RU[music.scale]} · реверб{" "}
                  {music.reverbDecay} с
                </div>
              )}
            </>
          ) : (
            <div className="truncate text-sm text-white/55">
              {audio.status === "unsupported" ? "Браузер не поддерживает Web Audio" : "Выберите объект на небе — и он зазвучит"}
            </div>
          )}
        </div>

        <div role="radiogroup" aria-label="Жанр" className="flex shrink-0 rounded-full bg-white/5 p-0.5 text-xs">
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
              className={`rounded-full px-3 py-1.5 transition ${audio.genre === g.id ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
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
          aria-label="Громкость"
          className="hidden w-24 accent-white sm:block"
        />
      </div>
    </div>
  );
}
