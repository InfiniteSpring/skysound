"use client";

import { useEffect, useRef } from "react";

/**
 * Bottom stack: sound settings above the player bar. Its live height is published as
 * `--dock-h` so, on phones, the content panels above always end right where it begins.
 */
export function BottomDock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--dock-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--dock-h");
    };
  }, []);
  return (
    <div ref={ref} className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 p-3 sm:p-4">
      {children}
    </div>
  );
}
