"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useAudio } from "@/components/audio/AudioProvider";
import { useLang } from "@/components/i18n/LangProvider";
import { useSky } from "@/components/sky/SkyProvider";

const SIZE = 36;
const C = SIZE / 2;
/** Three rings: radius, ripple count, base amplitude, rotation speed. */
const RINGS = [
  { r: 13.2, k: 7, a: 0.9, w: 0.35 },
  { r: 10.4, k: 5, a: 0.8, w: -0.5 },
  { r: 7.6, k: 4, a: 0.6, w: 0.7 },
];

/** Circle whose radius ripples like a waveform: r(θ) = R + A·sin(kθ + φ)·(envelope). */
function wavePath(R: number, k: number, A: number, phase: number) {
  const steps = 72;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const r = R + A * Math.sin(k * th + phase) * (0.55 + 0.45 * Math.sin(th * 2 + phase * 0.6));
    const x = C + r * Math.cos(th);
    const y = C + r * Math.sin(th);
    d += `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return d + "Z";
}

/**
 * A star ringed by sound: three orbits whose outlines ripple like audio waveforms. They
 * idle gently and swell while music plays; drawn straight into the SVG every frame.
 */
function WaveOrbitIcon({ playing }: { playing: boolean }) {
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const core = useRef<SVGCircleElement>(null);
  const energy = useRef(0);
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = playingRef.current ? 1 : 0;
      energy.current += (target - energy.current) * (1 - Math.exp(-dt * 3));
      t += dt * (0.5 + energy.current * 1.3);
      RINGS.forEach((ring, i) => {
        const el = paths.current[i];
        if (!el) return;
        const amp = ring.a * (0.35 + energy.current * 0.9);
        el.setAttribute("d", wavePath(ring.r, ring.k, amp, t * (1.6 + i * 0.4)));
        el.setAttribute("transform", `rotate(${((t * ring.w * 40) % 360).toFixed(1)} ${C} ${C})`);
      });
      core.current?.setAttribute("r", (2.6 + 0.5 * Math.sin(t * 2.4) * (0.4 + energy.current)).toFixed(2));
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg aria-hidden width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id="brand-wave" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e0f2fe" />
          <stop offset="55%" stopColor="#a5b4fc" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </linearGradient>
        <radialGradient id="brand-core">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#bae6fd" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
        </radialGradient>
        <filter id="brand-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.9" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#brand-glow)" fill="none" stroke="url(#brand-wave)" strokeLinejoin="round">
        {RINGS.map((ring, i) => (
          <path
            key={i}
            ref={(el) => {
              paths.current[i] = el;
            }}
            d={wavePath(ring.r, ring.k, ring.a * 0.35, i)}
            strokeWidth={1.15 - i * 0.15}
            opacity={0.95 - i * 0.18}
          />
        ))}
      </g>
      <circle cx={C} cy={C} r={5.5} fill="url(#brand-core)" opacity={0.55} />
      <circle ref={core} cx={C} cy={C} r={2.6} fill="#fff" />
    </svg>
  );
}

/** Logo: the wave-orbit icon, a two-line wordmark and a live equalizer. */
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
      <WaveOrbitIcon playing={playing} />
      <span className="flex flex-col leading-none max-[420px]:hidden">
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
