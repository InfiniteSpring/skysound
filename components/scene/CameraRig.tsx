"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { raDecToVector } from "@/lib/sky/coords";
import { FOCUS_FOV } from "./closeup/CloseUp";

const DEG = Math.PI / 180;
const MAX_PITCH = 88 * DEG;
const BASE_FOV = 62;
const MAX_FOV = 85;
const MIN_FOV_FREE = 14;
/** With an object selected the telescope can go deeper than the default focus. */
const MIN_FOV_FOCUSED = 2;

interface Props {
  /** RA/Dec to fly to, or null for free look. `zoom`: magnify into the close-up, or just turn to it. */
  target: { ra: number; dec: number; key: string; zoom: boolean } | null;
  /** Shared with the starfield so point sizes grow slightly when zoomed in. */
  zoomRef: React.RefObject<number>;
}

interface Flight {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fovFrom: number;
  fovTo: number;
  /** Extra widening (log-space) at mid-flight for long turns. */
  bump: number;
  t: number;
  duration: number;
}

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const dirFrom = (yaw: number, pitch: number) => new THREE.Vector3(...raDecToVector(yaw / DEG, pitch / DEG));

/**
 * Observer at the centre of the celestial sphere. Drag to look around (with inertia),
 * wheel to zoom (log-scale, smoothed). Selecting an object starts a timed flight: an eased
 * great-circle turn while the zoom glides in log space to telescope magnification, so
 * 62° → 1.2° feels perceptually even. Any drag or wheel input hands control back at once.
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
    dragging: false,
    lastX: 0,
    lastY: 0,
    idle: 0,
    hasTarget: false,
    shift: 0,
    shiftY: 0,
    flight: null as Flight | null,
  });
  const tmp = useRef({ q: new THREE.Quaternion(), qi: new THREE.Quaternion(), dir: new THREE.Vector3() });

  // Test/debug hook: the current field of view.
  useEffect(() => {
    const w = window as unknown as { __skysoundFov?: () => number };
    w.__skysoundFov = () => st.current.fov;
    return () => {
      delete w.__skysoundFov;
    };
  }, []);

  useEffect(() => {
    const el = domElement;
    const s = st.current;
    const radPerPx = () => (s.fov * DEG) / el.clientHeight;

    const down = (e: PointerEvent) => {
      s.dragging = true;
      if (s.flight) {
        s.flight = null;
        s.targetFov = s.fov;
      }
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
      const min = s.hasTarget ? MIN_FOV_FOCUSED : MIN_FOV_FREE;
      const base = s.flight ? s.fov : s.targetFov;
      s.targetFov = Math.max(min, Math.min(MAX_FOV, base * Math.exp(e.deltaY * 0.0016)));
      if (s.flight) {
        // Keep turning toward the target, but the zoom is the user's from now on.
        s.flight.fovFrom = s.fov;
        s.flight.fovTo = s.targetFov;
        s.flight.bump = 0;
      }
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

  const targetKey = target ? `${target.key}:${target.zoom}` : undefined;
  useEffect(() => {
    const s = st.current;
    s.hasTarget = !!target;
    const from = dirFrom(s.yaw, s.pitch);
    const to = target ? new THREE.Vector3(...raDecToVector(target.ra, target.dec)) : from.clone();
    const angle = from.angleTo(to) / DEG;
    const fovTo = target?.zoom ? FOCUS_FOV : BASE_FOV;
    // Widen mid-flight only when the target lies well outside the current view.
    const widen = target ? Math.max(1, Math.min(4, angle / (s.fov * 0.45))) : 1;
    const span = Math.abs(Math.log(fovTo / s.fov));
    s.flight = {
      from,
      to,
      fovFrom: s.fov,
      fovTo,
      bump: Math.log(widen),
      t: 0,
      duration: Math.min(4.2, 1.1 + angle / 70 + span * 0.42),
    };
    s.vYaw = s.vPitch = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fly once per selected object (and zoom setting)
  }, [targetKey]);

  useFrame((state, rawDt) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    const f = s.flight;

    if (f) {
      f.t = Math.min(1, f.t + dt / f.duration);
      // The turn completes in the first 60% of the flight…
      const e = easeInOut(Math.min(1, f.t / 0.6));
      const { q, qi, dir } = tmp.current;
      q.setFromUnitVectors(f.from, f.to);
      qi.identity().slerp(q, e);
      const d = dir.copy(f.from).applyQuaternion(qi);
      s.yaw = Math.atan2(-d.z, d.x);
      s.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
      // …while the zoom glides in log space over the last 75%, with a mid-flight bump.
      const z = easeInOut(Math.max(0, Math.min(1, (f.t - 0.25) / 0.75)));
      let fov = Math.exp(Math.log(f.fovFrom) + (Math.log(f.fovTo) - Math.log(f.fovFrom)) * z + f.bump * Math.sin(Math.PI * f.t) ** 2);
      // Never zoom tighter than what keeps the target in frame.
      const remaining = d.angleTo(f.to) / DEG;
      fov = Math.max(fov, Math.min(MAX_FOV, remaining * 2.6));
      s.fov = fov;
      s.targetFov = f.fovTo;
      if (f.t >= 1) s.flight = null;
    } else {
      if (!s.dragging) {
        // Inertia after a drag, then a very slow drift.
        s.yaw += s.vYaw;
        s.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, s.pitch + s.vPitch));
        const decay = Math.exp(-dt * 5);
        s.vYaw *= decay;
        s.vPitch *= decay;
        s.idle += dt;
        if (!s.hasTarget && s.idle > 4) s.yaw += dt * 0.006;
      }
      // Smooth zoom in log space.
      s.fov = Math.exp(Math.log(s.fov) + (Math.log(s.targetFov) - Math.log(s.fov)) * (1 - Math.exp(-dt * 7)));
    }

    // With an object selected on a wide screen, shift the image so the subject sits in the
    // free space right of the info panel instead of behind it.
    const { width, height } = state.size;
    // On phones the info panel fills the lower half instead: lift the subject into the upper part.
    const wantShift = s.hasTarget && width > 900 ? Math.min(0.17 * width, 260) : 0;
    const wantShiftY = s.hasTarget && width < 640 ? height * 0.28 : 0;
    const k = 1 - Math.exp(-dt * 3);
    s.shift += (wantShift - s.shift) * k;
    s.shiftY += (wantShiftY - s.shiftY) * k;
    const shifted = Math.abs(s.shift) > 0.5 || Math.abs(s.shiftY) > 0.5;
    if (shifted) camera.setViewOffset(width, height, -s.shift, s.shiftY, width, height);
    else if (camera.view?.enabled) camera.clearViewOffset();
    if (Math.abs(camera.fov - s.fov) > 1e-5 || shifted) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
    // Background stars stay pinpoints at telescope zoom (only a hint of growth).
    zoomRef.current = Math.min(1.12, Math.sqrt(BASE_FOV / s.fov));
    const [x, y, z] = raDecToVector(s.yaw / DEG, s.pitch / DEG);
    camera.lookAt(x, y, z);
  });

  return null;
}
