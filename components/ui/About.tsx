"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLang } from "@/components/i18n/LangProvider";

const AUTHOR_EMAIL = "mikita.loverau.main@gmail.com";
const AUTHOR_TELEGRAM = "UemDiHaskl";

const SOURCES = [
  { id: "simbad", name: "SIMBAD", url: "https://simbad.cds.unistra.fr/simbad/" },
  { id: "gaia", name: "Gaia Archive", url: "https://gea.esac.esa.int/archive/" },
  { id: "atnf", name: "ATNF Pulsar Catalogue", url: "https://www.atnf.csiro.au/research/pulsar/psrcat/" },
  { id: "vsx", name: "AAVSO VSX", url: "https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=B/vsx" },
  { id: "jpl", name: "JPL Horizons", url: "https://ssd.jpl.nasa.gov/horizons/" },
  { id: "wikidata", name: "Wikidata", url: "https://www.wikidata.org/" },
] as const;

const STACK = [
  { name: "Next.js", url: "https://nextjs.org/" },
  { name: "Tone.js", url: "https://tonejs.github.io/" },
  { name: "three.js", url: "https://threejs.org/" },
];

interface AboutApi {
  open: boolean;
  setOpen(open: boolean): void;
  sheetId: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  /** Rendered height of the sheet (px): how far the interface moves up while it's open. */
  height: number;
  setHeight(px: number): void;
  /** Finger offset (px) while the sheet is being swiped down on a touch screen, else null. */
  drag: number | null;
  setDrag(px: number | null): void;
}

/** One motion for the sheet and the interface it pushes up, so they move as a single piece. */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const DURATION = 550;
const slide = (props: string) =>
  props
    .split(",")
    .map((p) => `${p.trim()} ${DURATION}ms ${EASE}`)
    .join(", ");

const AboutContext = createContext<AboutApi | null>(null);

function useAbout() {
  const ctx = useContext(AboutContext);
  if (!ctx) throw new Error("useAbout must be used inside <AboutProvider>");
  return ctx;
}

export function AboutProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const [height, setHeight] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const api = useMemo(() => ({ open, setOpen, sheetId, triggerRef, height, setHeight, drag, setDrag }), [open, sheetId, height, drag]);
  return <AboutContext.Provider value={api}>{children}</AboutContext.Provider>;
}

/**
 * The interface layer (header, panels, player): slides up by the sheet's height while About
 * is open, as if the sheet pushed it. The sky behind stays put.
 */
export function AboutPush({ children }: { children: React.ReactNode }) {
  const { open, height, drag } = useAbout();
  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 motion-reduce:!transition-none"
      style={{
        transform: open ? `translateY(${-Math.max(0, height - (drag ?? 0))}px)` : "translateY(0)",
        transition: drag === null ? slide("transform") : "none", // follow the finger 1:1
      }}
    >
      {children}
    </div>
  );
}

/** "About": its own small panel right after the player bar (an "i" on phones). */
export function AboutButton() {
  const { open, setOpen, sheetId, triggerRef } = useAbout();
  const { t } = useLang();
  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls={sheetId}
      data-testid="about-toggle"
      aria-label={t.about.button}
      className="pointer-events-auto flex shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[#0b0d18]/50 px-3.5 text-sm text-white/65 backdrop-blur-md transition hover:border-white/25 hover:text-white sm:px-5"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="sm:hidden">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
      </svg>
      <span className="hidden sm:inline">{t.about.button}</span>
    </button>
  );
}

const link = "text-white/85 underline decoration-white/25 underline-offset-2 transition hover:text-white hover:decoration-white/60";

/**
 * About sheet: slides up from the bottom over the sky (no page change). Stays mounted so
 * both opening and closing animate; while closed it is inert and hidden from assistive tech.
 */
export function AboutSheet() {
  const { open, setOpen, sheetId, triggerRef, setHeight, drag, setDrag } = useAbout();
  const { t } = useLang();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Escape closes the sheet first (captured before the sky's own "Escape = whole sky").
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, setOpen]);

  // Dismiss gestures. Scrolling up while the sheet is already at its top closes it (wheel or
  // trackpad), and on touch screens pulling down from the top drags it closed (the handle
  // hints at that). A gesture that *reaches* the top by scrolling doesn't count, so momentum
  // from reading back up never closes it by surprise.
  useEffect(() => {
    const el = panelRef.current;
    if (!el || !open) return;
    let wheelUp = 0;
    let lastWheel = 0;
    let gestureAtTop = false;
    const onWheel = (e: WheelEvent) => {
      if (e.timeStamp - lastWheel > 220) {
        gestureAtTop = el.scrollTop <= 0;
        wheelUp = 0;
      }
      lastWheel = e.timeStamp;
      if (e.deltaY >= 0 || !gestureAtTop) return;
      wheelUp -= e.deltaY;
      if (wheelUp > 40) setOpen(false);
    };

    let touch: { y: number; t: number; base: number | null } | null = null;
    const onStart = (e: TouchEvent) => {
      touch = { y: e.touches[0].clientY, t: e.timeStamp, base: null };
    };
    const onMove = (e: TouchEvent) => {
      if (!touch) return;
      const y = e.touches[0].clientY;
      if (touch.base === null) {
        if (el.scrollTop > 0 || y - touch.y < 4) return; // a normal scroll
        touch.base = y;
        touch.t = e.timeStamp;
      }
      e.preventDefault(); // we own this gesture now: no scroll, no pull-to-refresh
      setDrag(Math.max(0, y - touch.base));
    };
    const onEnd = (e: TouchEvent) => {
      const g = touch;
      touch = null;
      if (!g || g.base === null) return;
      const dy = Math.max(0, (e.changedTouches[0]?.clientY ?? g.base) - g.base);
      const speed = dy / Math.max(1, e.timeStamp - g.t); // px/ms
      setDrag(null);
      if (dy > 90 || (dy > 20 && speed > 0.5)) setOpen(false);
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [open, setOpen, setDrag]);

  // Track the sheet's height (it changes with the language and the viewport).
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [setHeight]);

  // Focus moves into the sheet when it opens and back to the trigger when it closes.
  useEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true });
    else if (wasOpen.current) triggerRef.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open, triggerRef]);

  return (
    <>
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-30 bg-black/35 transition-opacity duration-500 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <section
        id={sheetId}
        role="dialog"
        aria-modal="true"
        aria-label={t.about.title}
        aria-hidden={!open}
        inert={!open}
        data-testid="about-sheet"
        className="fixed inset-x-0 bottom-0 z-40 motion-reduce:!transition-none"
        // Inline transform (not Tailwind's translate-* utilities, which animate the separate
        // `translate` property) so the slide shares one transition with the pushed interface.
        style={{
          transform: open ? `translateY(${drag ?? 0}px)` : "translateY(100%)",
          visibility: open ? "visible" : "hidden",
          transition: drag === null ? slide("transform, visibility") : "none",
        }}
      >
        <div
          ref={panelRef}
          className="max-h-[80vh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-white/10 bg-[#0b0d18]/50 px-5 pb-8 pt-6 shadow-2xl backdrop-blur-md sm:px-8 pointer-coarse:pt-3"
        >
          {/* Swipe handle: touch screens only. */}
          <div className="-mx-5 -mt-3 hidden pb-2 pt-3 pointer-coarse:block">
            <span aria-hidden className="mx-auto block h-1 w-10 rounded-full bg-white/15" />
          </div>
          {/* Edge to edge sheet; the text keeps a readable measure in the middle. */}
          <div className="mx-auto max-w-5xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-light tracking-tight text-white">{t.about.title}</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.about.close}
                className="-me-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <h3 className="mt-5 text-[11px] uppercase tracking-[0.2em] text-white/45">{t.about.howTitle}</h3>
            <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-white/75">
              {t.about.how.map((line, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/8 text-[10px] text-white/55"
                  >
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>

            <h3 className="mt-7 text-[11px] uppercase tracking-[0.2em] text-white/45">{t.about.sourcesTitle}</h3>
            <ul className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {SOURCES.map((s) => (
                <li key={s.id} className="leading-snug">
                  <a href={s.url} target="_blank" rel="noreferrer" className={link}>
                    {s.name}
                  </a>
                  <span className="block text-xs text-white/45">{t.about.sources[s.id]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-white/45">
              {t.about.builtWith}:{" "}
              {STACK.map((s, i) => (
                <span key={s.name}>
                  {i > 0 && ", "}
                  <a href={s.url} target="_blank" rel="noreferrer" className={link}>
                    {s.name}
                  </a>
                </span>
              ))}
            </p>

            <h3 className="mt-7 text-[11px] uppercase tracking-[0.2em] text-white/45">{t.about.contactTitle}</h3>
            <p className="mt-3 text-sm text-white/70">{t.about.contactText}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`mailto:${AUTHOR_EMAIL}`}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/85 transition hover:border-white/25 hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3.5 6 8.5 7 8.5-7" strokeLinejoin="round" />
                </svg>
                <bdi>{AUTHOR_EMAIL}</bdi>
              </a>
              <a
                href={`https://t.me/${AUTHOR_TELEGRAM}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/85 transition hover:border-white/25 hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="currentColor">
                  <path d="M21.4 4.1 2.9 11.3c-1.2.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.8-.4l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.4-1.5ZM9.6 14.4l-.4 4-1.5-4.8L18.6 7l-9 7.4Z" />
                </svg>
                <bdi>@{AUTHOR_TELEGRAM}</bdi>
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
