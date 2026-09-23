"use client";

import dynamic from "next/dynamic";

// Three.js needs the browser: never render the canvas on the server.
const SkyCanvas = dynamic(() => import("./SkyCanvas"), { ssr: false, loading: () => null });

export function SkyBackground() {
  return (
    <div className="fixed inset-0 -z-0" aria-hidden>
      <SkyCanvas />
    </div>
  );
}
