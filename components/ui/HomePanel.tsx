"use client";

import { useId, useState } from "react";

/**
 * The home page's bottom-left panel, styled like the other panels and collapsible like
 * the sound settings: the title stays as a header bar, the rest folds away smoothly.
 */
export function HomePanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <section
      className="pointer-events-auto mt-auto flex max-h-full w-full max-w-sm flex-col rounded-2xl border border-white/10 bg-[#0b0d18]/50 backdrop-blur-md"
      data-testid="home-panel"
    >
      <h1>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-start"
        >
          <span className="text-xl font-light tracking-tight">{title}</span>
          <svg
            aria-hidden
            width="12"
            height="12"
            viewBox="0 0 12 12"
            className={`shrink-0 text-white/50 transition-transform duration-300 ${open ? "" : "rotate-180"}`}
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </h1>
      {/* grid-rows 0fr -> 1fr animates to the content's natural height */}
      <div
        id={bodyId}
        inert={!open}
        className={`grid min-h-0 transition-[grid-template-rows,opacity,visibility] duration-300 ease-out motion-reduce:transition-none ${
          open ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0"
        }`}
      >
        {/* Padding lives inside the clipped box, or it would survive the collapse. */}
        <div className="min-h-0 overflow-y-auto">
          <div className="px-5 pb-5">{children}</div>
        </div>
      </div>
    </section>
  );
}
