"use client";

import { useId, useState } from "react";
import { useAudio } from "@/components/audio/AudioProvider";
import { useLang } from "@/components/i18n/LangProvider";
import { GENRE_LIST, GENRES, type GenreId, type LayerName } from "@/lib/audio/genres";
import { genreLayers, isNeutral, MIX_RANGES, mixedBpm } from "@/lib/audio/mix";

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

function Slider({
  label,
  value,
  range: [min, max, step],
  display,
  ends,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  range: readonly [number, number, number];
  display: string;
  ends?: [string, string];
  onChange(v: number): void;
  testId?: string;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <label htmlFor={id}>{label}</label>
        <span className="text-xs tabular-nums text-white/50">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testId}
        className="mt-1.5 w-full accent-white"
      />
      {ends && (
        <div className="flex justify-between text-[10px] text-white/35">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Per-genre mix: tempo, how many notes, how high, how much reverb, guitar gain and the
 * level of each layer. Edits the playing genre by default; changes are heard immediately.
 */
export function MixControls() {
  const audio = useAudio();
  const { t } = useLang();
  const [genre, setGenre] = useState<GenreId>(audio.genre);
  // Follow the player's genre when it changes there (adjusted during render, not in an effect).
  const [followed, setFollowed] = useState(audio.genre);
  if (followed !== audio.genre) {
    setFollowed(audio.genre);
    setGenre(audio.genre);
  }

  const mix = audio.mixes[genre];
  const preset = GENRES[genre];
  const playingThis = audio.nowPlaying?.genre === genre;
  const set = (patch: Parameters<typeof audio.setMix>[1]) => audio.setMix(genre, patch);
  const setLayer = (name: LayerName, patch: Partial<(typeof mix.layers)[LayerName]>) =>
    set({ layers: { ...mix.layers, [name]: { ...mix.layers[name], ...patch } } });

  return (
    <div className="space-y-4" data-testid="mix-controls">
      <div role="radiogroup" aria-label={t.player.genre} className="flex rounded-full bg-white/5 p-0.5 text-xs">
        {GENRE_LIST.map((g) => (
          <button
            key={g.id}
            type="button"
            role="radio"
            aria-checked={genre === g.id}
            onClick={() => setGenre(g.id)}
            className={`flex-1 whitespace-nowrap rounded-full px-2 py-1 transition ${genre === g.id ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <Slider
        label={t.mix.tempo}
        value={mix.tempo}
        range={MIX_RANGES.tempo}
        display={playingThis && audio.nowPlaying ? `${pct(mix.tempo)} · ${mixedBpm(audio.nowPlaying.baseBpm, mix)} BPM` : pct(mix.tempo)}
        onChange={(tempo) => set({ tempo })}
        testId="mix-tempo"
      />
      <Slider
        label={t.mix.density}
        value={mix.density}
        range={MIX_RANGES.density}
        display={`×${mix.density.toFixed(2).replace(/\.?0+$/, "")}`}
        ends={[t.mix.sparse, t.mix.busy]}
        onChange={(density) => set({ density })}
        testId="mix-density"
      />
      <Slider
        label={t.mix.register}
        value={mix.register}
        range={MIX_RANGES.register}
        display={pct(mix.register)}
        ends={[t.mix.low, t.mix.high]}
        onChange={(register) => set({ register })}
        testId="mix-register"
      />
      <Slider
        label={t.mix.space}
        value={mix.space}
        range={MIX_RANGES.space}
        display={`${Math.round(mix.space * 100)}%`}
        onChange={(space) => set({ space })}
      />
      {preset.instruments.guitar !== "none" && (
        <Slider
          label={t.mix.drive}
          value={mix.drive}
          range={MIX_RANGES.drive}
          display={`${Math.round(mix.drive * 100)}%`}
          ends={[t.mix.clean, t.mix.heavy]}
          onChange={(drive) => set({ drive })}
          testId="mix-drive"
        />
      )}

      <div>
        <div className="mb-2 text-xs text-white/60">{t.mix.layers}</div>
        <ul className="space-y-2">
          {genreLayers(genre).map((name) => {
            const l = mix.layers[name];
            return (
              <li key={name} className="flex items-center gap-3 text-sm">
                <button
                  type="button"
                  role="switch"
                  aria-checked={l.on}
                  onClick={() => setLayer(name, { on: !l.on })}
                  data-testid={`mix-layer-${name}`}
                  className={`w-20 shrink-0 truncate rounded-full px-2 py-0.5 text-start text-xs transition ${l.on ? "bg-white/15 text-white" : "bg-white/5 text-white/35 line-through"}`}
                >
                  {t.mix.layer[name]}
                </button>
                <input
                  type="range"
                  min={MIX_RANGES.db[0]}
                  max={MIX_RANGES.db[1]}
                  step={MIX_RANGES.db[2]}
                  value={l.db}
                  disabled={!l.on}
                  onChange={(e) => setLayer(name, { db: Number(e.target.value) })}
                  aria-label={`${t.mix.layer[name]}, dB`}
                  className="min-w-0 flex-1 accent-white disabled:opacity-30"
                />
                <span className="w-11 shrink-0 text-end text-xs tabular-nums text-white/50">
                  {l.db > 0 ? "+" : ""}
                  {l.db} dB
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => audio.resetMix(genre)}
        disabled={isNeutral(mix)}
        data-testid="mix-reset"
        className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/60 transition hover:text-white disabled:opacity-30"
      >
        {t.mix.reset(preset.label)}
      </button>
    </div>
  );
}
