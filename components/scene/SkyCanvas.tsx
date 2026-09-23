"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { useSky } from "@/components/sky/SkyProvider";
import { CameraRig } from "./CameraRig";
import { SkyObjects } from "./SkyObjects";
import { Starfield } from "./Starfield";

export default function SkyCanvas() {
  const { objects, selected, select } = useSky();
  const zoomRef = useRef(1);
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
    >
      <color attach="background" args={["#02030a"]} />
      <Starfield zoomRef={zoomRef} />
      <SkyObjects objects={objects} selectedSlug={selected?.slug ?? null} onSelect={select} />
      <CameraRig target={target} zoomRef={zoomRef} />
    </Canvas>
  );
}
