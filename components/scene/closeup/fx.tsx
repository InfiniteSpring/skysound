"use client";

import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { createContext, useContext, useRef, useState } from "react";
import * as THREE from "three";
import type { RGB, StarLook } from "@/lib/sky/visuals";
import { GLOW_FRAGMENT, QUAD_VERTEX, SPHERE_VERTEX, STAR_FRAGMENT, STAR_HALO_FRAGMENT } from "./shaders";

/** 0..1 visibility of the close-up (appear/disappear animation); every material multiplies by it. */
export const FadeContext = createContext<React.RefObject<number>>({ current: 0 });
export const useFadeRef = () => useContext(FadeContext);

type UniformValue = number | RGB | string | THREE.Vector3 | THREE.Vector4;

/** Colours are authored in sRGB; shaders work in linear light. */
const toUniform = (v: UniformValue) => {
  if (typeof v === "number") return { value: v };
  if (typeof v === "string") return { value: new THREE.Color(v) };
  if (Array.isArray(v)) return { value: new THREE.Color().setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace) };
  return { value: v };
};

/**
 * ShaderMaterial with `uTime` and `uOpacity` (the close-up fade) kept current every frame.
 * Uniforms are read once on mount — close-ups remount per object.
 */
export function FX({
  vertex,
  fragment,
  uniforms,
  additive = false,
  side = THREE.FrontSide,
  depthWrite = true,
  materialRef,
}: {
  vertex: string;
  fragment: string;
  uniforms: Record<string, UniformValue>;
  additive?: boolean;
  side?: THREE.Side;
  depthWrite?: boolean;
  materialRef?: React.RefObject<THREE.ShaderMaterial | null>;
}) {
  const ownRef = useRef<THREE.ShaderMaterial>(null);
  const ref = materialRef ?? ownRef;
  const fadeRef = useFadeRef();
  const [init] = useState(() => ({
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    ...Object.fromEntries(Object.entries(uniforms).map(([k, v]) => [k, toUniform(v)])),
  }));
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    m.uniforms.uTime.value = clock.elapsedTime;
    m.uniforms.uOpacity.value = fadeRef.current ?? 0;
  });
  return (
    <shaderMaterial
      ref={ref}
      vertexShader={vertex}
      fragmentShader={fragment}
      uniforms={init}
      transparent
      depthWrite={depthWrite && !additive}
      blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      side={side}
      toneMapped={false}
    />
  );
}

/** Radial glow on a camera-facing quad. */
export function Glow({ size, color, power = 2.5, gain = 1 }: { size: number; color: RGB; power?: number; gain?: number }) {
  return (
    <Billboard>
      <mesh>
        <planeGeometry args={[size * 2, size * 2]} />
        <FX vertex={QUAD_VERTEX} fragment={GLOW_FRAGMENT} uniforms={{ uColor: color, uPower: power, uGain: gain }} additive />
      </mesh>
    </Billboard>
  );
}

/**
 * A star: convecting photosphere plus a halo (corona, chromosphere, prominences).
 * `pulse` (normalized light curve) breathes size and brightness over ~6 s; `flares` adds
 * red-dwarf outbursts.
 */
export function StarBody({ look, pulse = null, hdr = 1.6 }: { look: StarLook; pulse?: number[] | null; hdr?: number }) {
  // Body and halo breathe together: scaling only the sphere would open a gap where the
  // halo's bright inner edge shows through as a white ring.
  const body = useRef<THREE.Group>(null);
  const mat = useRef<THREE.ShaderMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    let boost = 1;
    let scale = 1;
    if (pulse?.length) {
      const v = pulse[Math.floor(((t / 6) % 1) * pulse.length)];
      boost = 0.88 + 0.2 * v;
      scale = 0.985 + 0.03 * v;
    }
    if (look.flares) boost += Math.max(0, Math.sin(t * 0.7) * Math.sin(t * 2.3) - 0.6) * 2.5;
    body.current?.scale.setScalar(scale);
    if (mat.current) mat.current.uniforms.uBoost.value = boost;
  });
  const haloSize = 1 + look.corona * 0.9;
  return (
    <group ref={body}>
      <mesh>
        <sphereGeometry args={[look.radius, 96, 64]} />
        <FX
          materialRef={mat}
          vertex={SPHERE_VERTEX}
          fragment={STAR_FRAGMENT}
          uniforms={{ uColor: look.color, uGran: look.granulation, uContrast: look.contrast, uSpots: look.spots, uBoost: 1, uHDR: hdr }}
        />
      </mesh>
      {look.corona > 0 && (
        <Billboard>
          <mesh renderOrder={2}>
            <planeGeometry args={[look.radius * haloSize * 2, look.radius * haloSize * 2]} />
            <FX
              vertex={QUAD_VERTEX}
              fragment={STAR_HALO_FRAGMENT}
              uniforms={{ uColor: look.color, uSize: haloSize, uCorona: 0.45, uChromo: look.activity, uProm: look.activity }}
              additive
            />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}
