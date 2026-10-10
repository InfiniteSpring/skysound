"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { rng } from "@/lib/audio/random";
import { galacticToRaDec, kelvinToRgb, raDecToVector } from "@/lib/sky/coords";

const vertex = /* glsl */ `
  attribute float size;
  attribute float phase;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uZoom;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    float twinkle = 0.85 + 0.15 * sin(uTime * (0.6 + phase * 1.7) + phase * 40.0);
    vAlpha = twinkle;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uPixelRatio * uZoom;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    // Colours are authored in sRGB; the HDR pipeline works in linear light. Bright stars
    // exceed 1.0 slightly so bloom gives them a soft halo.
    gl_FragColor = vec4(pow(vColor, vec3(2.2)) * 1.7, a * vAlpha * uOpacity);
  }
`;

interface Layer {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  phases: Float32Array;
}

/** Background stars: uniform over the sphere with a power-law brightness distribution. */
function makeStars(count: number, radius: number): Layer {
  const r = rng(20261017);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const ra = r.next() * 360;
    const dec = (Math.asin(2 * r.next() - 1) * 180) / Math.PI;
    const [x, y, z] = raDecToVector(ra, dec);
    positions.set([x * radius, y * radius, z * radius], i * 3);
    const temp = 3000 + (r.next() ** 2) * 14000;
    const [cr, cg, cb] = kelvinToRgb(temp);
    const bright = 0.35 + 0.65 * r.next() ** 3;
    colors.set([cr * bright, cg * bright, cb * bright], i * 3);
    sizes[i] = 1.2 + 3.6 * r.next() ** 8;
    phases[i] = r.next();
  }
  return { positions, colors, sizes, phases };
}

/** Milky Way: faint points concentrated toward the galactic plane and centre. */
function makeMilkyWay(count: number, radius: number): Layer {
  const r = rng(42);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r.next())) * Math.cos(2 * Math.PI * r.next());
  for (let i = 0; i < count; i++) {
    const l = (gauss() * 70 + 360) % 360;
    const b = gauss() * (4 + 6 * r.next());
    const { ra, dec } = galacticToRaDec(l, b);
    const [x, y, z] = raDecToVector(ra, dec);
    positions.set([x * radius, y * radius, z * radius], i * 3);
    const warm = 0.55 + 0.45 * Math.cos((l * Math.PI) / 180);
    const k = 0.1 + 0.12 * r.next();
    colors.set([k * (0.8 + 0.2 * warm), k * (0.78 + 0.1 * warm), k * (0.95 - 0.15 * warm)], i * 3);
    sizes[i] = 1.6 + 2.5 * r.next();
    phases[i] = r.next();
  }
  return { positions, colors, sizes, phases };
}

function PointLayer({ layer, opacity, zoomRef }: { layer: Layer; opacity: number; zoomRef: React.RefObject<number> }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uOpacity: { value: opacity },
      uZoom: { value: 1 },
    }),
    [opacity],
  );
  useFrame(({ clock, gl }) => {
    const u = material.current?.uniforms;
    if (!u) return;
    u.uTime.value = clock.elapsedTime;
    u.uPixelRatio.value = gl.getPixelRatio();
    u.uZoom.value = zoomRef.current ?? 1;
  });
  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[layer.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[layer.colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[layer.sizes, 1]} />
        <bufferAttribute attach="attributes-phase" args={[layer.phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        vertexShader={vertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export function Starfield({ zoomRef }: { zoomRef: React.RefObject<number> }) {
  const stars = useMemo(() => makeStars(7000, 500), []);
  const milky = useMemo(() => makeMilkyWay(16000, 520), []);
  return (
    <>
      <PointLayer layer={milky} opacity={1} zoomRef={zoomRef} />
      <PointLayer layer={stars} opacity={1} zoomRef={zoomRef} />
    </>
  );
}
