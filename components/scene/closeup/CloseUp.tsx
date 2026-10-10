"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import { hashString } from "@/lib/audio/random";
import type { ObjectDto } from "@/lib/objects/dto";
import { raDecToVector, SKY_RADIUS } from "@/lib/sky/coords";
import { type Visual, visualFor } from "@/lib/sky/visuals";
import { Backdrop, Binary, BlackHole, Comet, Planet, Pulsar } from "./Bodies";
import { FadeContext, StarBody } from "./fx";

/** Telescope view the camera zooms to on selection (degrees): 10× magnification from the wide sky (62°). */
export const FOCUS_FOV = 62 / 10;
/** Radius of the close-up as a fraction of the half-height of the frame at FOCUS_FOV. */
const FOCUS_FILL = 0.05;

/**
 * Physical size of the close-up in world units: it fills ~40% of the frame at FOCUS_FOV.
 * At the normal wide view that makes it a point of a few pixels — the same object, just far
 * away — so zooming in is a continuous optical magnification, not a swap.
 */
export const CLOSEUP_SIZE = SKY_RADIUS * Math.tan(((FOCUS_FOV / 2) * Math.PI) / 180) * FOCUS_FILL;

/** On-screen radius (px) of a close-up of relative radius 1 at the given vertical fov. */
export function closeUpPixelRadius(fovDeg: number, viewportHeight: number) {
  return (CLOSEUP_SIZE / (SKY_RADIUS * Math.tan(((fovDeg / 2) * Math.PI) / 180))) * (viewportHeight / 2);
}

export function Body({ visual }: { visual: Visual }) {
  switch (visual.kind) {
    case "star":
      return <StarBody look={visual.star} pulse={visual.pulse} />;
    case "binary":
      return <Binary v={visual} />;
    case "planet":
      return <Planet v={visual} />;
    case "pulsar":
      return <Pulsar v={visual} />;
    case "comet":
      return <Comet />;
    case "black_hole":
      return <BlackHole v={visual} />;
  }
}

/** Invisible disc that catches clicks on the object. */
export function HitDisc({ radius }: { radius: number }) {
  return (
    <mesh onClick={(e) => e.stopPropagation()}>
      <circleGeometry args={[radius, 32]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}

/** Rough extent of a close-up (relative units), for the click-catching disc. */
function extentOf(v: Visual) {
  switch (v.kind) {
    case "planet":
      return v.radius * Math.max(1.1, v.rings?.outer ?? 0);
    case "binary":
      return v.separation / 2 + Math.max(v.a.radius, v.b.radius) * 1.3;
    case "black_hole":
      return 1.8; // the hole and its disk; the companion's orbit is mostly empty sky
    case "comet":
      return 3;
    default:
      return 1.4;
  }
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Detailed, animated rendering of the selected object at its place in the sky, always
 * facing the observer. Mounted only for the selected (or just-deselected) object.
 */
export function CloseUp({
  object,
  active,
  onGone,
  fades,
}: {
  object: ObjectDto;
  active: boolean;
  onGone(slug: string): void;
  /** Shared slug → fade map, so the sky marker can crossfade with this close-up. */
  fades: React.RefObject<Map<string, number>>;
}) {
  const leftAt = useRef<number | null>(null);
  const group = useRef<THREE.Group>(null);
  const fadeRef = useRef(0);
  const backdropRef = useRef(0);
  const gone = useRef(false);
  const visual = useMemo(() => visualFor(object), [object]);
  const seed = useMemo(() => (hashString(object.slug) % 1000) / 100, [object.slug]);
  const position = useMemo(
    () => raDecToVector(object.position.ra_deg, object.position.dec_deg).map((v) => v * SKY_RADIUS) as [number, number, number],
    [object.position.ra_deg, object.position.dec_deg],
  );

  // Test/debug hook: which close-up is mounted and how visible it is.
  useEffect(() => {
    if (!active) return;
    const w = window as unknown as { __skysoundCloseUp?: () => { slug: string; kind: string; fade: number } };
    w.__skysoundCloseUp = () => ({ slug: object.slug, kind: visual.kind, fade: fadeRef.current });
    return () => {
      delete w.__skysoundCloseUp;
    };
  }, [active, object.slug, visual.kind]);

  useFrame(({ camera, clock }, dt) => {
    const g = group.current;
    if (!g) return;
    const fov = (camera as THREE.PerspectiveCamera).fov;
    // Appearing: fade in. Leaving: stay solid while the camera pulls back so the object
    // visibly shrinks; hand over to its marker once we're back at the wide view (or after a
    // moment, if the camera turned to another object instead).
    if (active) leftAt.current = null;
    else leftAt.current ??= clock.elapsedTime;
    const away = leftAt.current !== null && clock.elapsedTime - leftAt.current > 2.5;
    const target = active ? 1 : away ? 0 : 1 - smooth(38, 55, fov);
    fadeRef.current += (target - fadeRef.current) * (1 - Math.exp(-dt * (active ? 2.5 : 4)));
    fades.current?.set(object.slug, fadeRef.current);
    if (!active && fadeRef.current < 0.01 && !gone.current) {
      gone.current = true;
      fades.current?.delete(object.slug);
      onGone(object.slug);
    }
    // At the 10× focus the real starfield is still dense enough; the deep-field layer only
    // helps if the user zooms further in with the wheel.
    backdropRef.current = fadeRef.current * (1 - smooth(3, 5, fov));
    g.visible = fadeRef.current > 0.003;
    g.lookAt(0, 0, 0); // local +z towards the observer
  });

  return (
    <group ref={group} position={position} scale={CLOSEUP_SIZE} visible={false}>
      {/* Clicking the object itself is not a click on empty sky (which would fly home). */}
      <HitDisc radius={extentOf(visual)} />
      <FadeContext.Provider value={fadeRef}>
        <Backdrop seed={seed} opacityRef={backdropRef} />
        <Body visual={visual} />
      </FadeContext.Provider>
    </group>
  );
}
