"use client";

import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useCallback, useMemo, useRef, useState } from "react";
import { useAudio } from "@/components/audio/AudioProvider";
import { useLang } from "@/components/i18n/LangProvider";
import { useSky } from "@/components/sky/SkyProvider";
import * as THREE from "three";
import type { ObjectDto } from "@/lib/objects/dto";
import { raDecToVector } from "@/lib/sky/coords";
import { RESIDENT_SLUGS } from "@/lib/sky/visuals";
import { CameraRig } from "./CameraRig";
import { CloseUp } from "./closeup/CloseUp";
import { SunDirContext } from "./closeup/fx";
import { Warmup } from "./closeup/Warmup";
import { SkyLabels, SkyObjects } from "./SkyObjects";
import { Starfield } from "./Starfield";

/** Pointer travel (px) below which a press-release counts as a click rather than a drag. */
const CLICK_SLOP = 6;

interface Layer {
  object: ObjectDto;
  active: boolean;
}

export default function SkyCanvas() {
  const { objects, selected, select, goHome } = useSky();
  const { nameOf } = useLang();
  const { settings } = useAudio();
  const zoom = settings.zoomOnSelect;
  const zoomRef = useRef(1);
  const labels = useRef(new Map<string, HTMLDivElement>());
  const fades = useRef(new Map<string, number>());
  const downRef = useRef<{ x: number; y: number } | null>(null);

  // The selected object's close-up plus any that are still fading out.
  // Residents (the Sun, the Moon) are always drawn as real bodies and never come or go.
  const residents = useMemo(() => objects.filter((o) => RESIDENT_SLUGS.has(o.slug)), [objects]);
  const sun = residents.find((o) => o.slug === "sun") ?? null;
  const sunDir = useMemo(() => (sun ? new THREE.Vector3(...raDecToVector(sun.position.ra_deg, sun.position.dec_deg)) : null), [sun]);
  // First view: a linked object's own patch of sky, otherwise the Sun's side.
  const [initial] = useState(() => {
    const at = selected ?? sun;
    return at ? { ra: at.position.ra_deg, dec: at.position.dec_deg } : null;
  });

  const [layers, setLayers] = useState<Layer[]>([]);
  const [shownSlug, setShownSlug] = useState<string | null>(null);
  if ((selected?.slug ?? null) !== shownSlug) {
    setShownSlug(selected?.slug ?? null);
    const pick = selected && !RESIDENT_SLUGS.has(selected.slug) ? selected : null;
    setLayers((prev) => {
      const leaving = prev.filter((l) => l.object.slug !== pick?.slug).map((l) => ({ ...l, active: false }));
      return pick ? [...leaving, { object: pick, active: true }] : leaving;
    });
  }
  const onGone = useCallback((slug: string) => setLayers((prev) => prev.filter((l) => l.active || l.object.slug !== slug)), []);

  const closeUpSlugs = useMemo(() => new Set([...layers.map((l) => l.object.slug), ...residents.map((o) => o.slug)]), [layers, residents]);
  const focusObject = (selected && RESIDENT_SLUGS.has(selected.slug) ? selected : layers.at(-1)?.object) ?? null;
  const focus = useMemo(
    () => (focusObject ? new THREE.Vector3(...raDecToVector(focusObject.position.ra_deg, focusObject.position.dec_deg)) : null),
    [focusObject],
  );
  const target = useMemo(
    () => (selected ? { ra: selected.position.ra_deg, dec: selected.position.dec_deg, key: selected.slug, zoom } : null),
    [selected, zoom],
  );

  return (
    <>
    <Canvas
      className="!fixed inset-0"
      style={{ touchAction: "none" }}
      // A fixed pixel ratio: changing it mid-session reallocates every post-processing buffer,
      // which shows as a blink.
      dpr={[1, 1.5]}
      flat
      camera={{ fov: 62, near: 0.05, far: 2000, position: [0, 0, 0] }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
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
      <color attach="background" args={["#010208"]} />
      <Starfield zoomRef={zoomRef} />
      <SkyObjects objects={objects} selectedSlug={selected?.slug ?? null} closeUpSlugs={closeUpSlugs} focus={focus} labels={labels} fades={fades} onSelect={select} />
      <SunDirContext.Provider value={sunDir}>
        {residents.map((o) => (
          <CloseUp
            key={o.slug}
            object={o}
            active={selected?.slug === o.slug}
            resident
            onSelect={() => select(o)}
            onGone={onGone}
            fades={fades}
          />
        ))}
        {layers.map((l) => (
          <CloseUp key={l.object.slug} object={l.object} active={l.active} onGone={onGone} fades={fades} />
        ))}
      </SunDirContext.Provider>
      <Warmup objects={objects} />
      <CameraRig target={target} zoomRef={zoomRef} initial={initial} />
      {/* MSAA on HDR buffers is expensive; SMAA gives clean edges for a fraction of the cost. */}
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.95} luminanceSmoothing={0.25} radius={0.72} />
        {/* ACES keeps stellar colours saturated where AgX washes bright discs out to beige. */}
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
        <Vignette offset={0.3} darkness={0.55} />
      </EffectComposer>
    </Canvas>
    <SkyLabels objects={objects} nameOf={nameOf} labels={labels} />
    </>
  );
}
