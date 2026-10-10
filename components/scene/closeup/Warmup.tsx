"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ObjectDto } from "@/lib/objects/dto";
import { SKY_RADIUS } from "@/lib/sky/coords";
import { type Visual, visualFor } from "@/lib/sky/visuals";
import { Body, CLOSEUP_SIZE } from "./CloseUp";
import { Backdrop, deepField } from "./Bodies";

/** One object per distinct set of shader programs. */
function representatives(objects: ObjectDto[]): Visual[] {
  const seen = new Map<string, Visual>();
  for (const o of objects) {
    const v = visualFor(o);
    const key = v.kind === "planet" ? `planet:${v.rings ? "ring" : ""}:${v.look.atmosphere ? "atmo" : ""}` : v.kind === "pulsar" ? `pulsar:${!!v.nebula}` : v.kind;
    if (!seen.has(key)) seen.set(key, v);
  }
  return [...seen.values()];
}

/**
 * Compiling a close-up's shaders the first time it appears costs a visible hitch right as the
 * zoom starts. Shortly after load (while the user is still looking at the whole sky) one of
 * each kind is drawn for a few frames at zero opacity in front of the camera, so every
 * program and the shared deep field are ready before the first click.
 * The set then stays mounted but hidden: three.js deletes a program as soon as no material
 * uses it, which would throw the compiled shaders away again.
 */
export function Warmup({ objects }: { objects: ObjectDto[] }) {
  const gl = useThree((s) => s.gl);
  const [phase, setPhase] = useState<"wait" | "draw" | "kept">("wait");
  const zero = useRef(0);
  const frames = useRef(0);
  const group = useRef<THREE.Group>(null);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const visuals = useMemo(() => representatives(objects), [objects]);

  useEffect(() => {
    const start = () => {
      gl.initTexture(deepField());
      setPhase("draw");
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 1200); // Safari
    return () => clearTimeout(id);
  }, [gl]);

  useFrame(({ camera }) => {
    const g = group.current;
    if (phase !== "draw" || !g) return;
    g.position.copy(camera.getWorldDirection(dir).multiplyScalar(SKY_RADIUS * 0.9));
    g.lookAt(0, 0, 0);
    // Programs compile on the first frame; a few more make sure everything has been drawn.
    if (++frames.current > 90) setPhase("kept");
  });

  if (phase === "wait") return null;
  return (
    <group ref={group} scale={CLOSEUP_SIZE} visible={phase === "draw"}>
      <mesh>
        <circleGeometry args={[0.01, 32]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <Backdrop seed={0} opacityRef={zero} />
      {visuals.map((v, i) => (
        <group key={i} position={[(i - visuals.length / 2) * 0.3, 0, 0]}>
          <Body visual={v} />
        </group>
      ))}
    </group>
  );
}
