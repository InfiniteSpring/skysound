"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ObjectDto } from "@/lib/objects/dto";
import { kelvinToRgb, raDecToVector, SKY_RADIUS } from "@/lib/sky/coords";

let glow: THREE.Texture | null = null;
let ring: THREE.Texture | null = null;

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d")!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture() {
  glow ??= canvasTexture((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.12, "rgba(255,255,255,0.9)");
    g.addColorStop(0.3, "rgba(255,255,255,0.28)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  return glow;
}

function ringTexture() {
  ring ??= canvasTexture((ctx, s) => {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
  });
  return ring;
}

/**
 * Labels are text drawn into a canvas texture on a sprite: no DOM elements to reposition
 * every frame, which kept dozens of labels from costing frame time.
 */
const LABEL_SCALE = 0.045; // world units per canvas pixel at the sky radius
function labelTexture(text: string) {
  const font = "500 26px system-ui, -apple-system, 'Segoe UI', sans-serif";
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 24;
  const h = 40;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#fff";
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  return { tex, w, h };
}

const TYPE_COLOR: Partial<Record<ObjectDto["type"], string>> = {
  planet: "#e9cfa3",
  moon: "#d7d7d7",
  small_body: "#bfb6a8",
  pulsar: "#a9d6ff",
};

const TYPE_SIZE: Record<ObjectDto["type"], number> = {
  star: 5.2,
  planet: 3.6,
  pulsar: 3.2,
  variable_star: 4.4,
  star_system: 4.2,
  moon: 2.6,
  small_body: 2.4,
  other: 3,
};

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
  label: labelText,
  selected,
  onSelect,
}: {
  object: ObjectDto;
  label: string;
  selected: boolean;
  onSelect(o: ObjectDto): void;
}) {
  const sprite = useRef<THREE.Sprite>(null);
  const ringRef = useRef<THREE.Sprite>(null);
  const [hovered, setHovered] = useState(false);
  const position = useMemo(
    () => raDecToVector(object.position.ra_deg, object.position.dec_deg).map((v) => v * SKY_RADIUS) as [number, number, number],
    [object.position.ra_deg, object.position.dec_deg],
  );
  const color = useMemo(() => colorFor(object), [object]);
  const base = TYPE_SIZE[object.type] * (object.slug === "sun" ? 1.3 : 1);
  const label = useMemo(() => labelTexture(labelText), [labelText]);
  useEffect(() => () => label.tex.dispose(), [label]);
  const samples = object.lightCurve?.samples;
  const rate = object.type === "pulsar" && object.params.period_s ? visibleRate(object.params.period_s) : 0;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    let b = 0.92 + 0.08 * Math.sin(t * 1.3 + position[0]);
    if (rate) {
      const phase = (t * rate) % 1;
      b = 0.55 + 0.9 * Math.exp(-((phase - 0.1) ** 2) / 0.004);
    } else if (samples?.length) {
      // Light curve replayed over 8 s.
      b = 0.7 + 0.5 * samples[Math.floor(((t / 8) % 1) * samples.length)];
    }
    const s = base * b * (hovered ? 1.25 : 1) * (selected ? 1.15 : 1);
    sprite.current?.scale.set(s, s, 1);
    if (ringRef.current) {
      const rs = base * 2.4 + Math.sin(t * 2) * 0.2;
      ringRef.current.scale.set(rs, rs, 1);
      (ringRef.current.material as THREE.SpriteMaterial).rotation = t * 0.3;
    }
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // that was a drag, not a click
    e.stopPropagation();
    onSelect(object);
  };

  return (
    <group position={position}>
      <sprite
        ref={sprite}
        onClick={click}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
        }}
      >
        <spriteMaterial map={glowTexture()} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      {selected && (
        <sprite ref={ringRef}>
          <spriteMaterial map={ringTexture()} color={color} transparent opacity={0.6} depthWrite={false} />
        </sprite>
      )}
      <sprite
        position={[0, -base * 0.75, 0]}
        scale={[label.w * LABEL_SCALE, label.h * LABEL_SCALE, 1]}
        center={new THREE.Vector2(0.5, 1)}
        raycast={() => null}
      >
        <spriteMaterial
          map={label.tex}
          transparent
          depthWrite={false}
          opacity={selected || hovered ? 1 : 0.55}
        />
      </sprite>
    </group>
  );
}

export function SkyObjects({
  objects,
  nameOf,
  selectedSlug,
  onSelect,
}: {
  objects: ObjectDto[];
  /** Localized label for an object (resolved outside the Canvas). */
  nameOf(o: ObjectDto): string;
  selectedSlug: string | null;
  onSelect(o: ObjectDto): void;
}) {
  return (
    <>
      {objects.map((o) => (
        <Marker key={o.slug} object={o} label={nameOf(o)} selected={o.slug === selectedSlug} onSelect={onSelect} />
      ))}
    </>
  );
}
