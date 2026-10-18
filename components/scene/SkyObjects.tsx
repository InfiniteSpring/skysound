"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ObjectDto } from "@/lib/objects/dto";
import { kelvinToRgb, raDecToVector, SKY_RADIUS } from "@/lib/sky/coords";
import { RESIDENT_SLUGS, visualFor } from "@/lib/sky/visuals";
import { closeUpPixelRadius } from "./closeup/CloseUp";

/** Field of view at which markers have their nominal size; they keep that on-screen size at any zoom. */
const BASE_FOV = 62;

let glow: THREE.Texture | null = null;

/** A radial texture from a brightness profile f(r), r = 0 (centre) … 1 (edge). */
function radialTexture(f: (r: number, angle: number) => number, size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const a = Math.min(1, Math.max(0, f(r, Math.atan2(dy, dx)))) * (r < 1 ? 1 : 0);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A point of light with a soft glow around it: no disc, no hard shoulder. */
function glowTexture() {
  glow ??= radialTexture((r) => Math.exp(-((r / 0.07) ** 2)) + 0.16 * Math.exp(-((r / 0.3) ** 2)) * (1 - r));
  return glow;
}

const TYPE_COLOR: Partial<Record<ObjectDto["type"], string>> = {
  planet: "#e9cfa3",
  moon: "#d7d7d7",
  small_body: "#bfb6a8",
  pulsar: "#a9d6ff",
  black_hole: "#ffa25a",
};

const TYPE_SIZE: Record<ObjectDto["type"], number> = {
  star: 4.4,
  planet: 3,
  pulsar: 2.7,
  variable_star: 3.7,
  star_system: 3.6,
  moon: 2.2,
  small_body: 2,
  black_hole: 2.9,
  other: 2.5,
};
/** Click target size for residents (the Sun, the Moon), whose bodies are drawn for real. */
const RESIDENT_SIZE = 12;

function colorFor(o: ObjectDto) {
  const preset = TYPE_COLOR[o.type];
  if (preset) return new THREE.Color(preset);
  const [r, g, b] = kelvinToRgb(o.params.temperature_k ?? 5800);
  return new THREE.Color(r, g, b);
}

/** Visible flash rate for pulsars: the spin folded by octaves into ~0.7–1.4 Hz. */
function visibleRate(periodS: number) {
  let f = 1 / periodS;
  while (f > 1.4) f /= 2;
  while (f < 0.7) f *= 2;
  return f;
}

function Marker({
  object,
  selected,
  hasCloseUp,
  focus,
  yieldTo,
  labelEl,
  closeUpFade,
  onSelect,
}: {
  object: ObjectDto;
  selected: boolean;
  /** A detailed close-up of this object is on screen (selected, or shrinking away). */
  hasCloseUp: boolean;
  /** Direction of the object whose close-up is on screen, if any. */
  focus: THREE.Vector3 | null;
  /** A more prominent neighbour this marker's label gives way to when they crowd on screen. */
  yieldTo: THREE.Vector3 | null;
  /** The label's DOM element, rendered outside the canvas (see SkyLabels). */
  labelEl: () => HTMLDivElement | undefined;
  /** Current visibility (0..1) of this object's close-up, if one is mounted. */
  closeUpFade: () => number;
  onSelect(o: ObjectDto): void;
}) {
  const sprite = useRef<THREE.Sprite>(null);
  const lastLabelOpacity = useRef(-1);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const [hovered, setHovered] = useState(false);
  const position = useMemo(
    () => raDecToVector(object.position.ra_deg, object.position.dec_deg).map((v) => v * SKY_RADIUS) as [number, number, number],
    [object.position.ra_deg, object.position.dec_deg],
  );
  const color = useMemo(() => colorFor(object), [object]);
  const resident = RESIDENT_SLUGS.has(object.slug);
  const base = resident ? RESIDENT_SIZE : TYPE_SIZE[object.type];
  /** Where the label goes, below the visible core (the Sun's glow is mostly faint). */
  const labelOffset = resident ? 0 : base * 4.6 + 10;
  /** Radius of this object's close-up (relative units), so its label clears the drawn body. */
  const bodyRadius = useMemo(() => {
    const v = visualFor(object);
    return v.kind === "star" ? v.star.radius : v.kind === "planet" ? v.radius : 1;
  }, [object]);
  const samples = object.lightCurve?.samples;
  const rate = object.type === "pulsar" && object.params.period_s ? visibleRate(object.params.period_s) : 0;
  const phaseOffset = position[0] * 7.3;
  const dir = useMemo(() => new THREE.Vector3(...position).normalize(), [position]);

  const scaler = useRef<THREE.Group>(null);
  const glowMat = useRef<THREE.SpriteMaterial>(null);

  /** How hidden the marker is right now; a hidden marker must not catch clicks either. */
  const hideRef = useRef(0);

  useFrame(({ clock, camera, size }) => {
    const t = clock.elapsedTime;
    const fov = (camera as THREE.PerspectiveCamera).fov;
    // Constant on-screen size: neighbours don't balloon when the telescope zooms in.
    scaler.current?.scale.setScalar(fov / BASE_FOV);
    // A close-up object is rendered for real at its true size; its marker dissolves as that
    // body grows past a few pixels (and returns as it shrinks back into a point).
    const px = closeUpPixelRadius(fov, size.height);
    // Crossfade with the close-up: the marker returns as the model fades away.
    const cf = hasCloseUp ? closeUpFade() : 0;
    // Residents (the Sun, the Moon) are always drawn as real bodies: no glow sprite, and the
    // label only steps aside when that body is the selected close-up.
    let hide = resident ? 1 : Math.min(1, Math.max(0, (px - 3) / 10)) * cf;
    let labelHide = resident && !selected ? 0 : Math.min(1, Math.max(0, (px - 8) / 30)) * cf;
    // Neighbours that would sit on top of a large close-up (Titan beside Saturn) step aside.
    if (!hasCloseUp && focus && px > 6) {
      const screenDist = dir.angleTo(focus) / ((fov * Math.PI) / 180) * size.height;
      const overlap = 1 - Math.min(1, Math.max(0, (screenDist - px * 2.2) / (px * 0.8 + 20)));
      hide = Math.max(hide, overlap);
      labelHide = Math.max(labelHide, overlap);
    }
    hideRef.current = resident ? 0 : hide; // a resident's (invisible) sprite still takes clicks
    if (glowMat.current) glowMat.current.opacity = 1 - hide;

    if (yieldTo && !selected && !hovered) {
      const sep = (dir.angleTo(yieldTo) / ((fov * Math.PI) / 180)) * size.height;
      labelHide = Math.max(labelHide, 1 - Math.min(1, Math.max(0, (sep - 30) / 20)));
    }
    const labelOpacity = Math.round((selected || hovered ? 1 : 0.62) * (1 - labelHide) * 100) / 100;
    const el = labelEl();
    if (el) {
      // Place the DOM label under the marker (projection includes the camera's view offset).
      projected.set(...position).project(camera);
      const visible = projected.z < 1 && Math.abs(projected.x) < 1.2 && Math.abs(projected.y) < 1.2;
      const opacity = visible ? labelOpacity : 0;
      if (visible) {
        const x = (projected.x * 0.5 + 0.5) * size.width;
        const y = (-projected.y * 0.5 + 0.5) * size.height + Math.max(labelOffset, px * bodyRadius * cf + 14);
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translateX(-50%)`;
      }
      if (opacity !== lastLabelOpacity.current) {
        el.style.opacity = String(opacity);
        lastLabelOpacity.current = opacity;
      }
    }
    // Gentle life, not flicker: a slow breath; pulsars and variables keep their rhythm, softly.
    let b = 1 + 0.025 * Math.sin(t * 0.6 + phaseOffset);
    if (rate) {
      const phase = (t * rate) % 1;
      b = 0.93 + 0.14 * Math.exp(-((phase - 0.1) ** 2) / 0.01);
    } else if (samples?.length) {
      b = 0.93 + 0.12 * samples[Math.floor(((t / 10) % 1) * samples.length)];
    }
    const s = base * b * (hovered ? 1.2 : 1) * (selected ? 1.1 : 1);
    sprite.current?.scale.set(s, s, 1);
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // that was a drag, not a click
    if (hideRef.current > 0.5) return; // stepped aside (Titan beside Saturn): let the close-up have it
    e.stopPropagation();
    onSelect(object);
  };

  return (
    <group position={position}>
      <group ref={scaler}>
        <sprite
          ref={sprite}
          onClick={click}
          onPointerOver={(e) => {
            if (hideRef.current > 0.5) return;
            e.stopPropagation();
            setHovered(true);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHovered(false);
            document.body.style.cursor = "";
          }}
        >
          <spriteMaterial
            ref={glowMat}
            map={glowTexture()}
            color={color}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      </group>
    </group>
  );
}

export function SkyObjects({
  objects,
  selectedSlug,
  closeUpSlugs,
  focus,
  labels,
  fades,
  onSelect,
}: {
  objects: ObjectDto[];
  fades: React.RefObject<Map<string, number>>;
  /** DOM label elements by slug, owned by SkyLabels outside the canvas. */
  labels: React.RefObject<Map<string, HTMLDivElement>>;
  focus: THREE.Vector3 | null;
  selectedSlug: string | null;
  closeUpSlugs: ReadonlySet<string>;
  onSelect(o: ObjectDto): void;
}) {
  // Label priority when markers overlap (Titan beside Saturn): bigger kinds win.
  const yields = useMemo(() => {
    const rank: Record<string, number> = { star: 5, planet: 6, black_hole: 4, pulsar: 4, variable_star: 5, star_system: 5, moon: 1, small_body: 2, other: 0 };
    const dirs = objects.map((o) => new THREE.Vector3(...raDecToVector(o.position.ra_deg, o.position.dec_deg)));
    const map = new Map<string, THREE.Vector3>();
    objects.forEach((o, i) => {
      let best: THREE.Vector3 | null = null;
      let bestAngle = (4 * Math.PI) / 180;
      objects.forEach((other, j) => {
        if (i === j) return;
        const outranks = rank[other.type] > rank[o.type] || (rank[other.type] === rank[o.type] && j < i);
        const a = dirs[i].angleTo(dirs[j]);
        if (outranks && a < bestAngle) {
          bestAngle = a;
          best = dirs[j];
        }
      });
      if (best) map.set(o.slug, best);
    });
    return map;
  }, [objects]);
  return (
    <>
      {objects.map((o) => (
        <Marker
          key={o.slug}
          object={o}
          selected={o.slug === selectedSlug}
          hasCloseUp={closeUpSlugs.has(o.slug)}
          focus={focus}
          yieldTo={yields.get(o.slug) ?? null}
          labelEl={() => labels.current?.get(o.slug)}
          closeUpFade={() => fades.current?.get(o.slug) ?? 0}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

/**
 * Marker labels as real DOM text in one overlay outside the canvas: crisp at any pixel
 * ratio, untouched by bloom/anti-aliasing, and positioned each frame by their markers.
 */
export function SkyLabels({
  objects,
  nameOf,
  labels,
}: {
  objects: ObjectDto[];
  nameOf(o: ObjectDto): string;
  labels: React.RefObject<Map<string, HTMLDivElement>>;
}) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {objects.map((o) => (
        <div
          key={o.slug}
          ref={(el) => {
            if (el) labels.current?.set(o.slug, el);
            else labels.current?.delete(o.slug);
          }}
          className="absolute left-0 top-0 whitespace-nowrap text-[11px] font-medium tracking-wide text-white will-change-transform [text-shadow:0_0_4px_rgba(0,0,0,0.55)]"
          style={{ opacity: 0 }}
        >
          {nameOf(o)}
        </div>
      ))}
    </div>
  );
}
