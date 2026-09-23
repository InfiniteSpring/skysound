const DEG = Math.PI / 180;

export const SKY_RADIUS = 100;

/**
 * Equatorial (RA/Dec, degrees) -> unit vector. y is the celestial north pole; seen from
 * inside the sphere RA grows to the left (east), as on a real sky.
 */
export function raDecToVector(raDeg: number, decDeg: number): [number, number, number] {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return [Math.cos(d) * Math.cos(a), Math.sin(d), -Math.cos(d) * Math.sin(a)];
}

/** Inverse of raDecToVector for a camera direction: yaw = RA, pitch = Dec (radians). */
export function vectorToYawPitch([x, y, z]: [number, number, number]) {
  return { yaw: Math.atan2(-z, x), pitch: Math.asin(Math.max(-1, Math.min(1, y))) };
}

// J2000 rotation from galactic to equatorial coordinates.
const G2E = [
  [-0.0548755604, 0.4941094279, -0.867666149],
  [-0.8734370902, -0.44482963, -0.1980763734],
  [-0.4838350155, 0.7469822445, 0.4559837762],
];

export function galacticToRaDec(lDeg: number, bDeg: number) {
  const l = lDeg * DEG;
  const b = bDeg * DEG;
  const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  const e = G2E.map((row) => row[0] * g[0] + row[1] * g[1] + row[2] * g[2]);
  let ra = Math.atan2(e[1], e[0]) / DEG;
  if (ra < 0) ra += 360;
  return { ra, dec: Math.asin(e[2]) / DEG };
}

/** Approximate blackbody colour (Tanner Helland fit), as linear 0..1 RGB. */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  return [c(r), c(g), c(b)];
}
