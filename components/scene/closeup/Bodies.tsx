"use client";

import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { StarLook, Visual } from "@/lib/sky/visuals";
import { FX, Glow, StarBody } from "./fx";
import {
  ATMOSPHERE_FRAGMENT,
  BEAM_FRAGMENT,
  BLACK_HOLE_FRAGMENT,
  NEBULA_FRAGMENT,
  PLANET_FRAGMENT,
  QUAD_VERTEX,
  RING_FRAGMENT,
  SPHERE_VERTEX,
  TAIL_FRAGMENT,
} from "./shaders";

const DEG = Math.PI / 180;
/** Tip every body a little toward the viewer so rings and poles read as 3D. */
const VIEW_TIP = 0.32;
/** Sunlight direction in the close-up frame (+z faces the observer): from the front-left, above. */
const LIGHT = new THREE.Vector3(-0.55, 0.3, 0.78).normalize();

type V<K extends Visual["kind"]> = Extract<Visual, { kind: K }>;

/**
 * Planet rendered in its tilt frame: the surface pattern spins via a uniform, so lighting,
 * ring shadows and the atmosphere all share one coordinate system.
 */
export function Planet({ v }: { v: V<"planet"> }) {
  const tilt = useRef<THREE.Group>(null);
  const surfaceMat = useRef<THREE.ShaderMaterial>(null);
  const atmoMat = useRef<THREE.ShaderMaterial>(null);
  const ringMat = useRef<THREE.ShaderMaterial>(null);
  const spin = useRef(0);
  const tmp = useMemo(
    () => ({
      cam: new THREE.Vector3(),
      light: new THREE.Vector3(),
      q: new THREE.Quaternion(),
    }),
    [],
  );
  const { look } = v;
  const ring = v.rings;

  useFrame(({ camera }, dt) => {
    const g = tilt.current;
    if (!g) return;
    spin.current += (dt * 2 * Math.PI) / v.spinS;
    const cam = g.worldToLocal(tmp.cam.copy(camera.position));
    const light = tmp.light.copy(LIGHT).applyQuaternion(tmp.q.copy(g.quaternion).invert());
    for (const m of [surfaceMat.current, atmoMat.current, ringMat.current]) {
      if (!m) continue;
      m.uniforms.uCamPos.value.copy(cam);
      m.uniforms.uLight.value.copy(light);
    }
    if (surfaceMat.current) surfaceMat.current.uniforms.uSpin.value = spin.current;
  });

  const ringUniforms = {
    uRingIn: v.radius * (ring?.inner ?? 0),
    uRingOut: v.radius * (ring?.outer ?? 0),
    uRingGap: ring?.gap ?? -1,
    uRingAlpha: ring ? ring.opacity : 0,
  };

  return (
    <group ref={tilt} rotation={[VIEW_TIP, 0, -v.tiltDeg * DEG]}>
      <mesh>
        <sphereGeometry args={[v.radius, 128, 96]} />
        <FX
          materialRef={surfaceMat}
          vertex={SPHERE_VERTEX}
          fragment={PLANET_FRAGMENT}
          uniforms={{
            uLight: new THREE.Vector3(),
            uCamPos: new THREE.Vector3(),
            ...ringUniforms,
            uSpin: 0,
            uGas: look.gas ? 1 : 0,
            uBump: look.bump,
            uC0: look.colors[0],
            uC1: look.colors[1],
            uC2: look.colors[2],
            uBands: look.bands,
            uBandFreq: look.bandFreq,
            uTurb: look.turbulence,
            uCraters: look.craters,
            uPolar: look.polarCaps,
            uAtmo: look.atmosphere?.strength ?? 0,
            uAtmoColor: look.atmosphere?.color ?? "#000000",
            uSpotColor: look.spot?.color ?? "#000000",
            uSpot: new THREE.Vector4(look.spot?.lat ?? 0, look.spot?.lon ?? 0, look.spot?.size ?? 1, look.spot ? 1 : 0),
          }}
        />
      </mesh>
      {look.atmosphere && (
        <mesh scale={1.06}>
          <sphereGeometry args={[v.radius, 64, 48]} />
          <FX
            materialRef={atmoMat}
            vertex={SPHERE_VERTEX}
            fragment={ATMOSPHERE_FRAGMENT}
            uniforms={{
              uLight: new THREE.Vector3(),
              uCamPos: new THREE.Vector3(),
              uAtmo: look.atmosphere.strength,
              uAtmoColor: look.atmosphere.color,
              uR: v.radius,
            }}
            additive
            side={THREE.BackSide}
          />
        </mesh>
      )}
      {ring && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <ringGeometry args={[v.radius * ring.inner, v.radius * ring.outer, 256, 1]} />
          <FX
            materialRef={ringMat}
            vertex={SPHERE_VERTEX}
            fragment={RING_FRAGMENT}
            uniforms={{
              uLight: new THREE.Vector3(),
              uCamPos: new THREE.Vector3(),
              ...ringUniforms,
              uPlanetR: v.radius,
              uColor: ring.color,
            }}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

/** Two stars on a shared orbit; edge-on orbits produce real eclipses through depth testing. */
export function Binary({ v }: { v: V<"binary"> }) {
  const orbit = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (orbit.current) orbit.current.rotation.z += (dt * 2 * Math.PI) / v.periodS;
  });
  const ra = v.separation * (v.b.radius / (v.a.radius + v.b.radius));
  const rb = v.separation - ra;
  return (
    <group rotation={[(v.inclination * Math.PI) / 2, 0, 0.25]}>
      <group ref={orbit}>
        <group position={[-ra, 0, 0]}>
          <StarBody look={v.a} />
        </group>
        <group position={[rb, 0, 0]}>
          <StarBody look={v.b} hdr={v.b.radius < 0.2 ? 2.6 : 1.6} />
        </group>
      </group>
    </group>
  );
}

const NEUTRON_STAR: StarLook = {
  color: [0.82, 0.9, 1],
  radius: 0.12,
  granulation: 24,
  contrast: 0.12,
  corona: 0,
  spots: 0,
  flares: false,
  activity: 0,
};

/** Lighthouse: a white-hot neutron star whose two beams sweep around a tilted spin axis. */
export function Pulsar({ v }: { v: V<"pulsar"> }) {
  const spin = useRef<THREE.Group>(null);
  const flash = useRef<THREE.Group>(null);
  const height = 3.6;
  const beam = useMemo(() => {
    const g = new THREE.ConeGeometry(0.4, height, 48, 1, true);
    g.rotateZ(Math.PI);
    g.translate(0, height / 2, 0); // apex at the star, opening outwards along +y
    return g;
  }, []);
  const tmp = useMemo(
    () => ({
      dir: new THREE.Vector3(),
      cam: new THREE.Vector3(),
      q: new THREE.Quaternion(),
    }),
    [],
  );
  useFrame(({ camera }, dt) => {
    const s = spin.current;
    if (!s) return;
    s.rotation.y += dt * 2 * Math.PI * v.spinHz;
    const beamDir = tmp.dir.set(0, 1, 0).applyQuaternion(s.children[0].getWorldQuaternion(tmp.q));
    const toCam = camera.getWorldDirection(tmp.cam).negate();
    flash.current?.scale.setScalar(0.6 + 2.4 * Math.pow(Math.abs(beamDir.dot(toCam)), 14));
  });
  return (
    <group>
      {v.nebula && (
        <Billboard position={[0, 0, -1.5]}>
          <mesh>
            <planeGeometry args={[v.nebula.size, v.nebula.size]} />
            <FX vertex={QUAD_VERTEX} fragment={NEBULA_FRAGMENT} uniforms={{ uC0: v.nebula.colors[0], uC1: v.nebula.colors[1] }} additive />
          </mesh>
        </Billboard>
      )}
      <group rotation={[0.55, 0, 0.3]}>
        <group ref={spin}>
          <group rotation={[0, 0, 0.75]}>
            {[0, Math.PI].map((r) => (
              <mesh key={r} geometry={beam} rotation={[0, 0, r]}>
                <FX
                  vertex={SPHERE_VERTEX}
                  fragment={BEAM_FRAGMENT}
                  uniforms={{ uColor: [0.7, 0.85, 1], uHeight: height }}
                  additive
                  side={THREE.DoubleSide}
                />
              </mesh>
            ))}
          </group>
        </group>
      </group>
      <StarBody look={NEUTRON_STAR} hdr={4} />
      <group ref={flash}>
        <Glow size={0.9} color={[0.75, 0.88, 1]} power={3} gain={3} />
      </group>
    </group>
  );
}

/**
 * Comet: what a telescope shows is the glowing coma (the nucleus itself is far too small
 * and hidden inside it) with two tails flaring out of the head — a broad, curved, yellowish
 * dust tail and a narrow, straight, blue ion tail — both pointing away from the Sun.
 */
export function Comet() {
  return (
    <group rotation={[0, 0, 0.45]}>
      <mesh position={[3.6, 0.05, -0.2]} rotation={[0, 0, -0.1]}>
        <planeGeometry args={[7.2, 2.4]} />
        <FX vertex={QUAD_VERTEX} fragment={TAIL_FRAGMENT} uniforms={{ uColor: [1, 0.88, 0.7], uCurve: 0.32, uHead: 0.24 }} additive />
      </mesh>
      <mesh position={[3.9, 0, -0.1]} rotation={[0, 0, 0.05]}>
        <planeGeometry args={[7.8, 1.0]} />
        <FX vertex={QUAD_VERTEX} fragment={TAIL_FRAGMENT} uniforms={{ uColor: [0.5, 0.76, 1], uCurve: 0, uHead: 0.4 }} additive />
      </mesh>
      {/* coma: wide soft glow, then a bright compact inner coma */}
      <Glow size={1.3} color={[0.72, 0.95, 0.9]} power={3.2} gain={2.6} />
      <Glow size={0.32} color={[0.95, 1, 0.97]} power={2.2} gain={5} />
    </group>
  );
}

/** Ray-traced black hole on one quad, plus an optional companion star on an orbit. */
export function BlackHole({ v }: { v: V<"black_hole"> }) {
  const orbit = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (orbit.current) orbit.current.rotation.y += (dt * 2 * Math.PI) / 60;
  });
  return (
    <group>
      {v.companion && (
        <group rotation={[0.35, 0, 0.12]}>
          <group ref={orbit}>
            <group position={[v.companion.distance, 0, 0]}>
              <StarBody look={v.companion} />
            </group>
          </group>
        </group>
      )}
      <mesh renderOrder={3}>
        <planeGeometry args={[4.2, 4.2]} />
        <FX
          vertex={QUAD_VERTEX}
          fragment={BLACK_HOLE_FRAGMENT}
          uniforms={{
            uDiskTemp: v.diskTemp,
            uDisk: v.disk,
            uIncl: v.inclination,
            uJet: v.jet ? 1 : 0,
            uDiskOut: v.diskOuter,
          }}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Deep field painted once into a texture (per object seed): tiny coloured stars and faint
 * distant smudges. At telescope zoom the real starfield is nearly empty; sampling a static
 * texture keeps this full-screen layer essentially free.
 */
function deepFieldTexture(seed: number) {
  // 2048 px over a quad sized so one texel is ~1 screen pixel at the focus zoom: stars stay
  // pinpoints instead of magnified blobs.
  const size = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  let a = Math.floor(seed * 1e6) >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  // Distant galaxies / nebulosity: a few very soft, faint blobs.
  for (let i = 0; i < 14; i++) {
    const x = rand() * size,
      y = rand() * size,
      r = 30 + rand() * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = rand() < 0.5 ? "120,110,170" : "170,130,110";
    g.addColorStop(0, `rgba(${hue},${0.05 + rand() * 0.05})`);
    g.addColorStop(1, `rgba(${hue},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.3 + rand() * 0.7), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Stars: mostly tiny and faint, a few brighter; warm-to-cool colours.
  const tints = ["255,214,170", "255,240,220", "235,240,255", "205,220,255", "255,190,150"];
  for (let i = 0; i < 2600; i++) {
    const x = rand() * size,
      y = rand() * size;
    const m = Math.pow(rand(), 7);
    const r = 0.6 + m * 1.6;
    const alpha = 0.18 + m * 0.7;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    g.addColorStop(0, `rgba(${tints[Math.floor(rand() * tints.length)]},${alpha})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
  }
  // Soft circular edge: the field never shows a border, whatever the zoom.
  ctx.globalCompositeOperation = "destination-in";
  const edge = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size / 2);
  edge.addColorStop(0, "rgba(0,0,0,1)");
  edge.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Backdrop width in close-up units (~18 world units: ~1 texel per pixel at the focus zoom). */
const BACKDROP_UNITS = 40;

/** Faint deep field behind the close-up, visible only at telescope zoom. */
let sharedField: THREE.CanvasTexture | null = null;
/**
 * Painting 2600 gradients takes tens of milliseconds, far too long for the frame a zoom
 * starts in: one field is painted once (at warm-up) and every object sees it turned its own way.
 */
export function deepField() {
  sharedField ??= deepFieldTexture(0.4242);
  return sharedField;
}

export function Backdrop({ seed, opacityRef }: { seed: number; opacityRef: React.RefObject<number> }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const texture = deepField();
  useFrame(() => {
    if (mat.current) mat.current.opacity = opacityRef.current ?? 0;
  });
  return (
    <mesh position={[0, 0, -6]} rotation={[0, 0, seed * 2.4]} renderOrder={-1}>
      <planeGeometry args={[BACKDROP_UNITS, BACKDROP_UNITS]} />
      <meshBasicMaterial ref={mat} map={texture} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </mesh>
  );
}
