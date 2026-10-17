"use client";

import { useId, useState } from "react";
import { useAudio, type SwitchOrder } from "@/components/audio/AudioProvider";
import { useLang } from "@/components/i18n/LangProvider";
import { useSky } from "@/components/sky/SkyProvider";

const MINUTE_PRESETS = [1, 5, 10, 20, 30];
const ORDERS: SwitchOrder[] = ["random", "sequential", "same_type"];

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange(v: T): void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-full px-2.5 py-1 text-xs transition ${
            value === o.id ? "bg-white text-black" : "bg-white/5 text-white/60 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange(v: boolean): void;
  testId?: string;
}) {
  return (
    <div>
      <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
          data-testid={testId}
        />
        <span
          aria-hidden
          className="relative h-5 w-9 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-white after:absolute after:start-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4 rtl:peer-checked:after:-translate-x-4 peer-checked:after:bg-black peer-focus-visible:ring-2 peer-focus-visible:ring-white/50"
        />
      </label>
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    </div>
  );
}

const groupTitle = "text-[10px] uppercase tracking-[0.2em] text-white/35";

/** Settings, bottom-right — the mirror of the object info panel. Collapsed by default. */
export function SettingsPanel() {
  const { settings, updateSettings } = useAudio();
  const { nextSwitchIn } = useSky();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <aside aria-label={t.settings.title} className="pointer-events-auto w-full self-end sm:max-w-sm" data-testid="settings-panel">
      <div className="rounded-2xl border border-white/10 bg-[#0b0d18]/50 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-center justify-between px-5 py-3 text-start"
        >
          <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">{t.settings.title}</span>
          <span className="flex items-center gap-3 text-xs text-white/50">
            {nextSwitchIn !== null && <span data-testid="switch-countdown">{t.settings.switchIn(fmtClock(nextSwitchIn))}</span>}
            <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}>
              <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        </button>

        {/* grid-rows 0fr -> 1fr animates to the content's natural height */}
        <div
          id={bodyId}
          inert={!open}
          className={`grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out motion-reduce:transition-none ${
            open ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="max-h-[min(42dvh,34rem)] sm:max-h-[min(62dvh,34rem)] space-y-5 overflow-y-auto overscroll-contain px-5 pb-5">
              <div className="space-y-3">
                <div className={groupTitle}>{t.settings.view}</div>
                <Switch
                  label={t.settings.zoom}
                  hint={t.settings.zoomHint}
                  checked={settings.zoomOnSelect}
                  onChange={(v) => updateSettings({ zoomOnSelect: v })}
                  testId="zoom-on-select"
                />
                <Switch
                  label={t.settings.homeTrack}
                  hint={t.settings.homeTrackHint}
                  checked={settings.homeShowsTrack}
                  onChange={(v) => updateSettings({ homeShowsTrack: v })}
                  testId="home-shows-track"
                />
              </div>
              <div className={`${groupTitle} border-t border-white/10 pt-4`}>{t.settings.sound}</div>
              <div>
                <div className="flex items-baseline justify-between text-sm">
                  <label htmlFor={`${bodyId}-crossfade`}>{t.settings.crossfade}</label>
                  <span className="text-xs text-white/50">
                    {settings.crossfadeS} {t.player.sec}
                  </span>
                </div>
                <input
                  id={`${bodyId}-crossfade`}
                  type="range"
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={settings.crossfadeS}
                  onChange={(e) => updateSettings({ crossfadeS: Number(e.target.value) })}
                  className="mt-2 w-full accent-white"
                />
              </div>

              <div>
                <Switch
                  label={t.settings.autoSwitch}
                  hint={t.settings.autoSwitchHint}
                  checked={settings.autoSwitch}
                  onChange={(v) => updateSettings({ autoSwitch: v })}
                  testId="auto-switch"
                />

                <fieldset disabled={!settings.autoSwitch} className="mt-3 space-y-3 transition-opacity disabled:opacity-40">
                  <div>
                    <div className="mb-1.5 flex items-baseline justify-between text-xs text-white/60">
                      <span>{t.settings.playEach}</span>
                      <span>{t.settings.minutes(settings.switchMinutes)}</span>
                    </div>
                    <Segmented
                      label={t.settings.duration}
                      options={MINUTE_PRESETS.map((m) => ({ id: m, label: t.settings.minutes(m) }))}
                      value={settings.switchMinutes}
                      onChange={(m) => updateSettings({ switchMinutes: m })}
                    />
                    <input
                      type="range"
                      min={1}
                      max={60}
                      step={1}
                      value={settings.switchMinutes}
                      onChange={(e) => updateSettings({ switchMinutes: Number(e.target.value) })}
                      aria-label={t.settings.minutesLabel}
                      className="mt-2 w-full accent-white"
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs text-white/60">{t.settings.next}</div>
                    <Segmented
                      label={t.settings.order}
                      options={ORDERS.map((id) => ({ id, label: t.settings.orders[id] }))}
                      value={settings.switchOrder}
                      onChange={(o) => updateSettings({ switchOrder: o })}
                    />
                  </div>
                </fieldset>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
