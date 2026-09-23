"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { raDecToVector } from "@/lib/sky/coords";

const DEG = Math.PI / 180;
const MAX_PITCH = 88 * DEG;
const BASE_FOV = 62;
const FOCUS_FOV = 38;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

interface Props {
  /** RA/Dec to fly to, or null for free look. */
  target: { ra: number; dec: number; key: string } | null;
  /** Shared with the starfield so point sizes grow slightly when zoomed in. */
  zoomRef: React.RefObject<number>;
}

/**
 * Observer at the centre of the celestial sphere: drag to look around (with inertia),
 * wheel to zoom, and a smooth flight to the selected object.
 */
export function CameraRig({ target, zoomRef }: Props) {
  const domElement = useThree((s) => s.gl.domElement);
  const st = useRef({
    yaw: 85 * DEG, // start near Orion
    pitch: 5 * DEG,
    vYaw: 0,
    vPitch: 0,
    fov: BASE_FOV,
    targetFov: BASE_FOV,
    flying: false,
    targetYaw: 0,
    targetPitch: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    idle: 0,
  });

  useEffect(() => {
    const el = domElement;
    const s = st.current;
    const radPerPx = () => (s.fov * DEG) / el.clientHeight;

    const down = (e: PointerEvent) => {
      s.dragging = true;
      s.flying = false;
      s.vYaw = s.vPitch = 0;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!s.dragging) return;
      const k = radPerPx();
      const dYaw = (e.clientX - s.lastX) * k;
      const dPitch = (e.clientY - s.lastY) * k;
      s.yaw += dYaw;
      s.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, s.pitch + dPitch));
      s.vYaw = dYaw;
      s.vPitch = dPitch;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      s.idle = 0;
    };
    const up = (e: PointerEvent) => {
      s.dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      s.targetFov = Math.max(14, Math.min(85, s.targetFov * (1 + e.deltaY * 0.0012)));
      s.idle = 0;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [domElement]);

  const targetKey = target?.key;
  useEffect(() => {
    if (!target) {
      st.current.targetFov = BASE_FOV;
      return;
    }
    const s = st.current;
    s.targetYaw = target.ra * DEG;
    s.targetPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, target.dec * DEG));
    s.flying = true;
    s.targetFov = FOCUS_FOV;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fly once per selected object
  }, [targetKey]);

  useFrame((state, rawDt) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    if (s.flying) {
      const k = 1 - Math.exp(-dt * 2.4);
      const dy = wrap(s.targetYaw - s.yaw);
      const dp = s.targetPitch - s.pitch;
      s.yaw += dy * k;
      s.pitch += dp * k;
      if (Math.abs(dy) < 1e-4 && Math.abs(dp) < 1e-4) s.flying = false;
    } else if (!s.dragging) {
      // Inertia after a drag, then a very slow sidereal-like drift.
      s.yaw += s.vYaw;
      s.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, s.pitch + s.vPitch));
      const decay = Math.exp(-dt * 5);
      s.vYaw *= decay;
      s.vPitch *= decay;
      s.idle += dt;
      if (!target && s.idle > 4) s.yaw += dt * 0.006;
    }
    s.fov += (s.targetFov - s.fov) * (1 - Math.exp(-dt * 2.5));
    if (Math.abs(camera.fov - s.fov) > 1e-3) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
    zoomRef.current = Math.sqrt(BASE_FOV / s.fov);
    const [x, y, z] = raDecToVector(s.yaw / DEG, s.pitch / DEG);
    camera.lookAt(x, y, z);
  });

  return null;
}
