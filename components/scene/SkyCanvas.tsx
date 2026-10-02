"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { useLang } from "@/components/i18n/LangProvider";
import { useSky } from "@/components/sky/SkyProvider";
import { CameraRig } from "./CameraRig";
import { SkyObjects } from "./SkyObjects";
import { Starfield } from "./Starfield";

/** Pointer travel (px) below which a press-release counts as a click rather than a drag. */
const CLICK_SLOP = 6;

export default function SkyCanvas() {
  const { objects, selected, select, goHome } = useSky();
  const { nameOf } = useLang();
  const zoomRef = useRef(1);
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const target = useMemo(
    () => (selected ? { ra: selected.position.ra_deg, dec: selected.position.dec_deg, key: selected.slug } : null),
    [selected],
  );

  return (
    <Canvas
      className="!fixed inset-0"
      style={{ touchAction: "none" }}
      dpr={[1, 1.75]}
      camera={{ fov: 62, near: 0.1, far: 2000, position: [0, 0, 0] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      data-testid="sky-canvas"
      onPointerDown={(e) => {
        downRef.current = { x: e.clientX, y: e.clientY };
      }}
      // A click on empty sky (not a drag to look around) returns to the whole-sky view.
      onPointerMissed={(e) => {
        const d = downRef.current;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP) return;
        goHome();
      }}
    >
      <color attach="background" args={["#02030a"]} />
      <Starfield zoomRef={zoomRef} />
      <SkyObjects objects={objects} nameOf={nameOf} selectedSlug={selected?.slug ?? null} onSelect={select} />
      <CameraRig target={target} zoomRef={zoomRef} />
    </Canvas>
  );
}
