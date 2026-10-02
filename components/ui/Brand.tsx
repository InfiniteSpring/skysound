"use client";

import Link from "next/link";
import { useAudio } from "@/components/audio/AudioProvider";
import { useLang } from "@/components/i18n/LangProvider";
import { useSky } from "@/components/sky/SkyProvider";

/** Logo: a planet with an orbiting moon, a two-line wordmark and a live equalizer. */
export function Brand() {
  const { t, href } = useLang();
  const { goHome } = useSky();
  const { status } = useAudio();
  const playing = status === "playing";
  const [quiet, accent] = t.brand;

  return (
    <Link
      href={href("/")}
      scroll={false}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        goHome();
      }}
      aria-label={t.siteName}
      className="group pointer-events-auto flex shrink-0 items-center gap-3"
    >
      <svg aria-hidden width="34" height="34" viewBox="0 0 34 34" className="shrink-0">
        <defs>
          <radialGradient id="brand-planet" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#e0f2fe" />
            <stop offset="55%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#312e81" />
          </radialGradient>
        </defs>
        <g transform="rotate(-24 17 17)">
          {/* back half of the orbit, planet, then the front half over it */}
          <path d="M2 17a15 5.5 0 0 1 30 0" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
        </g>
        <circle cx="17" cy="17" r="7" fill="url(#brand-planet)" />
        <g transform="rotate(-24 17 17)">
          <path d="M2 17a15 5.5 0 0 0 30 0" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
          <circle r="1.6" fill="#fff">
            <animateMotion dur="9s" repeatCount="indefinite" path="M2 17a15 5.5 0 1 0 30 0a15 5.5 0 1 0 -30 0" />
          </circle>
        </g>
      </svg>
      <span className="flex flex-col leading-none">
        {quiet && (
          <span className="mb-1 text-[9px] font-medium uppercase tracking-[0.32em] text-white/45 transition-colors group-hover:text-white/70">
            {quiet}
          </span>
        )}
        <span className="flex items-center gap-2">
          <span className="bg-gradient-to-r from-white via-sky-200 to-violet-300 bg-clip-text text-lg font-semibold tracking-tight text-transparent">
            {accent}
          </span>
          <span aria-hidden className={`eq flex h-3.5 items-end gap-[2px] ${playing ? "eq-on" : ""}`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="w-[2px] rounded-full bg-sky-200/70" />
            ))}
          </span>
        </span>
      </span>
    </Link>
  );
}
