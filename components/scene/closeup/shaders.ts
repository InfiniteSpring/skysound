import { NOISE } from "./glsl";

export { QUAD_VERTEX, SPHERE_VERTEX } from "./glsl";

/* ───────────────────────────── stars ───────────────────────────── */

/**
 * Photosphere: cellular granulation advected by a slow convective flow, finer
 * sub-granulation, sunspots with umbra/penumbra, faculae near the limb, quadratic limb
 * darkening that cools toward the edge. HDR output so the disk glows through bloom.
 */
export const STAR_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uTime, uOpacity, uGran, uContrast, uSpots, uBoost, uHDR, uSpin, uBelts;
uniform vec3 uColor;
varying vec3 vPos;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  vec3 p0 = normalize(vPos);
  float t = uTime;
  // The surface turns about the (vertical) rotation axis.
  float sa = sin(t * uSpin), ca = cos(t * uSpin);
  vec3 p = vec3(ca * p0.x + sa * p0.z, p0.y, -sa * p0.x + ca * p0.z);
  vec3 flow = vec3(snoise(p * 1.7 + vec3(t * 0.012, 0.0, 0.0)),
                   snoise(p * 1.7 + vec3(5.2, t * 0.010, 1.3)),
                   snoise(p * 1.7 + vec3(2.8, 7.1, t * 0.011)));
  vec3 q = p * uGran + flow * 0.9;
  vec2 c = worley(q + vec3(0.0, 0.0, t * 0.035));
  float cells = smoothstep(0.0, 0.75, c.y - c.x) * (0.75 + 0.25 * smoothstep(0.6, 0.0, c.x)); // granules, soft lanes
  float fine = snoise(q * 3.1 + vec3(t * 0.06)) * 0.5 + 0.5; // sub-granular texture
  float gran = mix(0.62, 1.0, cells) * mix(0.88, 1.04, fine);
  gran = mix(1.0, gran, clamp(uContrast * 2.0, 0.0, 1.0));
  float large = fbm3(p * 3.0 + t * 0.005) * 0.5 + 0.5;       // supergranulation

  float sn = snoise(p * 1.8 + vec3(11.0, 0.0, t * 0.004));
  if (uBelts > 0.0) {
    // Sunspot groups: small, clustered, only in the mid-latitude belts of both hemispheres.
    float lat = abs(p.y);
    float belt = smoothstep(0.1, 0.24, lat) * smoothstep(0.58, 0.36, lat);
    float group = smoothstep(0.45, 0.8, snoise(p * 2.2 + vec3(3.0, 0.0, t * 0.002)));
    sn = (snoise(p * 6.5 + vec3(11.0, 0.0, t * 0.003)) * 0.5 + 0.5) * belt * group * 1.12;
  }
  float pen = smoothstep(0.42, 0.52, sn) * uSpots;
  float umb = smoothstep(0.56, 0.63, sn) * uSpots;
  float penTex = 0.75 + 0.25 * sin(atan(p.z, p.x) * 90.0 + sn * 40.0);

  float I = gran * (0.88 + 0.24 * large) * (1.0 - pen * 0.45 * penTex - umb * 0.55);
  float mu = clamp(dot(vNormalV, vViewDir), 0.0, 1.0);
  float limb = 1.0 - 0.62 * (1.0 - mu) - 0.22 * (1.0 - mu) * (1.0 - mu);
  float fac = smoothstep(0.3, 0.8, snoise(p * 7.0 + t * 0.01)) * pow(1.0 - mu, 1.5) * 0.45;

  float hot = clamp((uColor.b - uColor.r) * 3.0 + 0.5, 0.0, 1.0);
  vec3 edgeTint = mix(vec3(1.0, 0.5, 0.28), vec3(0.65, 0.78, 1.0), hot);
  vec3 col = uColor * (I * limb + fac) * mix(edgeTint, vec3(1.0), pow(mu, 0.45));
  gl_FragColor = vec4(col * uBoost * uHDR, uOpacity);
}
`;

/**
 * Everything around a star on one camera-facing quad (units: star radii): a streaming
 * corona, the thin chromosphere, and prominences arching off the limb. Additive HDR.
 */
export const STAR_HALO_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uTime, uOpacity, uSize, uCorona, uChromo, uProm, uRays;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 q = vUv * uSize;
  float r = length(q);
  if (r < 0.995 || r > uSize) discard;
  vec2 dir = q / r;
  float h = max(r - 1.0, 0.0);

  float streamers = snoise(vec3(dir * 2.6, h * 0.5 - uTime * 0.025)) * 0.35 + snoise(vec3(dir * 5.3, h * 0.9 - uTime * 0.03)) * 0.15 + 0.5;
  float rays = snoise(vec3(dir * 16.0, h * 0.3 - uTime * 0.05)) * 0.5 + 0.5;
  float corona = pow(1.0 / r, 4.0) * (0.3 + 0.8 * streamers * streamers + 0.15 * rays * uRays) * uCorona * mix(0.6, 1.0, uRays);

  float chromo = exp(-pow(h / 0.03, 2.0)) * uChromo; // wide enough to stay smooth on screen

  // Prominences live within ~0.35 radii of the limb: skip their noise everywhere else.
  float prom = 0.0;
  if (uProm > 0.0 && h < 0.35) {
    float activeZone = smoothstep(0.3, 0.75, snoise(vec3(dir * 2.0, uTime * 0.01)));
    if (activeZone > 0.0) {
      // Soft plasma tongues and arches hugging the limb.
      float tongue = snoise(vec3(dir * 5.0, h * 4.0 - uTime * 0.03)) * 0.6 + snoise(vec3(dir * 11.0, h * 9.0 - uTime * 0.05)) * 0.4;
      prom = smoothstep(0.25, 0.7, tongue) * exp(-h / 0.06) * activeZone * uProm;
    }
  }

  vec3 col = uColor * corona * 1.3
           + mix(uColor, vec3(1.0, 0.3, 0.25), 0.65) * chromo * 0.45
           + vec3(1.0, 0.32, 0.16) * prom * 1.6;
  float edge = smoothstep(uSize, uSize * 0.75, r);
  gl_FragColor = vec4(col * edge, 1.0) * uOpacity;
}
`;

/* ───────────────────────────── planets ───────────────────────────── */

/** Ring optical depth at radius rr; shared by the ring shader and the ring shadow on the planet. */
const RING_DENSITY = /* glsl */ `
uniform float uRingIn, uRingOut, uRingGap, uRingAlpha;
float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float vnoise1(float x) { float i = floor(x), f = fract(x); return mix(h11(i), h11(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float ringDensity(float rr) {
  float t = (rr - uRingIn) / (uRingOut - uRingIn);
  if (t < 0.0 || t > 1.0) return 0.0;
  float d = 0.45 + 0.3 * vnoise1(t * 40.0) + 0.18 * vnoise1(t * 140.0) + 0.1 * vnoise1(t * 520.0);
  d *= mix(0.3, 1.0, smoothstep(0.08, 0.26, t));                    // faint inner C ring
  if (uRingGap > 0.0) {
    d *= 1.0 - 0.95 * exp(-pow((t - uRingGap) / 0.022, 2.0));       // Cassini division
    d *= 1.0 - 0.85 * exp(-pow((t - 0.93) / 0.004, 2.0));           // Encke gap
  }
  return clamp(d, 0.0, 1.0) * smoothstep(0.0, 0.02, t) * smoothstep(1.0, 0.97, t);
}
`;

/**
 * Planet surface in the tilt frame (the mesh does not spin; the pattern does, via uSpin):
 * gas-giant belts with alternating zonal winds and a swirling storm, or rocky terrain with
 * craters lit through a bump-mapped normal. Day/night terminator, limb darkening,
 * daylit atmospheric rim, and the shadow of the rings.
 */
export const PLANET_FRAGMENT = /* glsl */ `
${NOISE}
${RING_DENSITY}
uniform float uTime, uOpacity, uSpin, uGas, uBands, uBandFreq, uTurb, uCraters, uPolar, uAtmo, uBump;
uniform vec3 uC0, uC1, uC2, uAtmoColor, uSpotColor, uLight, uCamPos;
uniform vec4 uSpot; // lat, lon, size, enabled
varying vec3 vPos;

vec3 spinY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }

float craters(vec3 p, float freq) {
  // Full 3×3×3 neighbourhood: craters reaching across cell borders stay continuous
  // (a smaller search leaves seams that bump mapping turns into noise).
  vec3 P = p * freq, i = floor(P), f = fract(P);
  float h = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 rnd = hash33(i + o);
    if (rnd.z > 0.6) continue;                     // not every cell has a crater
    float rad = 0.18 + 0.32 * rnd.x;
    float d = length(o + rnd * 0.8 + 0.1 - f) / rad;
    if (d < 1.0) h += (d * d - 1.0) * rad;          // bowl
    h += exp(-pow((d - 1.0) / 0.22, 2.0)) * 0.35 * rad; // raised rim
  }
  return h;
}
float terrain(vec3 p) {
  float h = fbm3(p * 3.0) * 0.06;
  return h + uCraters * craters(p, 5.0) * 0.9;
}
/** Bump from screen-space derivatives of the height: one terrain evaluation per pixel. */
vec3 bumpNormal(vec3 pos, vec3 n, float h, float scale) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2) * scale;
  return normalize(abs(det) * n - grad);
}

vec3 gasAlbedo(vec3 sp) {
  float lat = asin(clamp(sp.y, -1.0, 1.0));
  float wind = sin(lat * uBandFreq * 0.5) * 0.05;                  // alternating jets
  float lon = atan(sp.z, sp.x) + uTime * wind;
  vec3 q = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  vec3 s = vec3(q.x * 1.6, q.y * 10.0, q.z * 1.6);
  float w1 = fbm3(s * 1.2 + vec3(0.0, 0.0, uTime * 0.01));
  float w2 = fbm(s * 2.6 + w1 * 1.6 + 2.7);
  float latw = lat + uTurb * 0.06 * w2;
  float b = 0.5 + 0.22 * sin(latw * uBandFreq) + 0.16 * sin(latw * uBandFreq * 2.13 + 1.7) + 0.1 * sin(latw * uBandFreq * 4.7 + 0.3);
  b = mix(0.5, b, uBands) + w2 * 0.12 * uTurb;
  vec3 col = mix(uC2, uC0, smoothstep(0.25, 0.55, b));
  col = mix(col, uC1, smoothstep(0.55, 0.82, b));
  col *= 0.93 + 0.14 * snoise(vec3(q.x * 5.0, q.y * 70.0, q.z * 5.0));   // fine streaks
  if (uSpot.w > 0.5) {
    float spotLon = uSpot.y + uTime * sin(uSpot.x * uBandFreq * 0.5) * 0.05;
    float dlon = atan(sin(lon - spotLon), cos(lon - spotLon));
    vec2 d = vec2(dlon * cos(uSpot.x) * 0.5, lat - uSpot.x) / uSpot.z;
    float dd = length(d);
    float ang = 5.0 * exp(-dd * dd * 2.5) - uTime * 0.4;               // vortex swirl
    vec2 rd = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d;
    float swirl = fbm3(vec3(rd * 3.0, 1.7)) * 0.5 + 0.5;
    vec3 spot = uSpotColor * (0.8 + 0.4 * swirl);
    col = mix(col, spot, smoothstep(1.0, 0.65, dd));
    col = mix(col, uC1 * 1.05, exp(-pow((dd - 1.05) / 0.12, 2.0)) * 0.5); // pale collar
  }
  return col;
}

vec3 rockAlbedo(vec3 sp, float h) {
  float n = fbm3(sp * 2.5) * 0.5 + 0.5;
  vec3 col = mix(uC2, uC0, smoothstep(0.25, 0.7, n));
  col = mix(col, uC1, smoothstep(0.62, 0.85, fbm3(sp * 5.0 + 3.0) * 0.5 + 0.5));
  col *= 0.9 + 0.35 * clamp(h, -0.3, 0.4);                          // crater floors darker, rims brighter
  float cap = uPolar > 0.0 ? smoothstep(1.0 - uPolar, 1.0 - uPolar + 0.03, abs(sp.y) + 0.02 * snoise(sp * 12.0)) : 0.0;
  return mix(col, vec3(0.93, 0.95, 1.0), cap);
}

void main() {
  vec3 n = normalize(vPos);
  vec3 sp = spinY(n, uSpin);
  vec3 N = n;
  vec3 albedo;
  if (uGas > 0.5) {
    albedo = gasAlbedo(sp);
  } else {
    float h0 = terrain(sp);
    N = normalize(mix(n, bumpNormal(vPos, n, h0, uBump * 1.6), 0.85));
    albedo = rockAlbedo(sp, h0);
  }

  vec3 L = normalize(uLight);
  vec3 V = normalize(uCamPos - vPos);
  float ndl = dot(N, L);
  float diff;
  if (uGas > 0.5) {
    diff = smoothstep(-0.12, 0.65, ndl) * pow(max(dot(n, V), 0.0), 0.22);  // soft terminator, limb darkening
  } else {
    diff = clamp(ndl, 0.0, 1.0) * smoothstep(-0.05, 0.15, dot(n, L));       // crisp, relief-lit
  }

  if (uRingAlpha > 0.0 && abs(L.y) > 1e-3) {
    float s = -vPos.y / L.y;
    if (s > 0.0) diff *= 1.0 - ringDensity(length((vPos + L * s).xz)) * uRingAlpha * 0.85;
  }

  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 atmo = uAtmoColor * rim * uAtmo * smoothstep(-0.25, 0.5, dot(n, L)) * 1.6;
  vec3 col = albedo * (diff * 1.25 + 0.012) + atmo;
  gl_FragColor = vec4(col, uOpacity);
}
`;

/** Atmosphere shell (back faces of a slightly larger sphere): a soft daylit halo past the limb. */
export const ATMOSPHERE_FRAGMENT = /* glsl */ `
uniform float uOpacity, uAtmo, uR;
uniform vec3 uAtmoColor, uLight, uCamPos;
varying vec3 vPos;
void main() {
  // Where does the view ray through this pixel pass relative to the planet? Glow falls off
  // with height above the limb, so the halo hugs the planet with no gap.
  vec3 P = vPos * 1.06;
  vec3 D = normalize(P - uCamPos);
  vec3 closest = uCamPos + D * dot(-uCamPos, D);
  float b = length(closest);
  if (b < uR) discard;                       // in front of the disk: the surface shader's rim handles it
  float glow = exp(-(b - uR) / (0.025 * uR));
  float lit = smoothstep(-0.35, 0.45, dot(normalize(closest), normalize(uLight)));
  gl_FragColor = vec4(uAtmoColor * glow * lit * uAtmo * 1.6, 1.0) * uOpacity;
}
`;

/**
 * Rings in the tilt frame: fine banding, Cassini and Encke gaps, sunlit vs. shadowed face,
 * forward scattering, and the planet's shadow across them.
 */
export const RING_FRAGMENT = /* glsl */ `
${RING_DENSITY}
uniform float uOpacity, uPlanetR;
uniform vec3 uColor, uLight, uCamPos;
varying vec3 vPos;
void main() {
  vec3 P = vec3(vPos.x, 0.0, -vPos.y);            // ring plane -> tilt frame
  float rr = length(P.xz);
  float d = ringDensity(rr);
  if (d < 0.01) discard;
  vec3 L = normalize(uLight);
  vec3 V = normalize(uCamPos - P);
  float b = dot(P, L), c = dot(P, P) - uPlanetR * uPlanetR, disc = b * b - c;
  float shadow = (disc > 0.0 && -b - sqrt(disc) > 0.0) ? 0.06 : 1.0;
  float sunlitSide = sign(L.y) == sign(V.y) ? 1.0 : 0.45 + 0.55 * (1.0 - d); // seen from the dark side: light leaks through
  float forward = 1.0 + 1.5 * pow(max(dot(-V, L), 0.0), 8.0);
  float tone = 0.8 + 0.4 * vnoise1(rr * 300.0);
  vec3 col = uColor * tone * (0.25 + 0.75 * abs(L.y)) * sunlitSide * forward * shadow * 1.15;
  gl_FragColor = vec4(col, d * uRingAlpha * uOpacity);
}
`;

/* ───────────────────────────── black holes ───────────────────────────── */

/**
 * Schwarzschild black hole, ray traced per pixel. Each ray is integrated through the
 * hole's gravity (photon orbit equation, adaptive steps), so the accretion disk and the
 * background stars are genuinely lensed: the far side of the disk arches over the shadow,
 * the photon ring appears by itself, stars smear into Einstein arcs. The disk has a
 * thin-disk temperature profile, Keplerian turbulence, Doppler beaming and gravitational
 * redshift. Units: Schwarzschild radius = 1.
 */
export const BLACK_HOLE_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uTime, uOpacity, uIncl, uDisk, uJet, uDiskTemp, uDiskOut;
varying vec2 vUv;

const float R_IN = 3.0;   // innermost stable circular orbit
#define R_OUT uDiskOut

vec3 background(vec3 d) {
  vec3 c = vec3(0.0);
  vec3 g = d * 140.0, i = floor(g), f = fract(g) - 0.5;
  vec3 h = hash33(i);
  if (h.x < 0.05) {
    float dist = length(f - (h - 0.5) * 0.7);
    c += blackbody(3000.0 + h.y * 9000.0) * exp(-dist * dist * 400.0) * 2.0 * h.z * h.z;
  }
  float milky = snoise(d * 3.0) * 0.5 + 0.5;
  c += vec3(0.05, 0.045, 0.07) * pow(milky, 3.0) * exp(-pow(d.y * 2.5, 2.0));
  return c;
}

vec4 diskEmission(vec3 P, vec3 rayDir) {
  float rr = length(P.xz);
  if (rr < R_IN || rr > R_OUT) return vec4(0.0);
  float x = R_IN / rr;
  float temp = uDiskTemp * pow(x, 0.75) * pow(max(1.0 - sqrt(x), 0.0), 0.25) * 1.6;
  float v = sqrt(0.5 / (rr - 1.0));                    // orbital speed (c = 1)
  vec3 vel = normalize(vec3(-P.z, 0.0, P.x)) * v;
  float gamma = 1.0 / sqrt(1.0 - v * v);
  float doppler = 1.0 / (gamma * (1.0 - dot(vel, -rayDir)));
  float shift = doppler * sqrt(1.0 - 1.0 / rr);       // Doppler × gravitational redshift
  float a1 = atan(P.z, P.x) - uTime * (v / rr) * 5.0;  // Keplerian shear
  // Sampled on a circle in angle and stretched in radius: long, thin orbiting filaments.
  vec3 tq = vec3(cos(a1) * 2.2, sin(a1) * 2.2, rr * 1.6);
  float turb = fbm3(tq + vec3(0.0, 0.0, uTime * 0.04)) * 0.5 + 0.5;
  float rings = 0.9 + 0.1 * sin(rr * 7.0 + turb * 5.0);
  float dens = smoothstep(R_IN, R_IN + 0.5, rr) * smoothstep(R_OUT, R_OUT * 0.55, rr) * (0.2 + 1.0 * turb * turb) * rings;
  vec3 col = blackbody(temp * shift) * pow(shift, 3.0) * dens * 1.5 * pow(R_IN / rr, 1.2);
  return vec4(col, clamp(dens * 0.9, 0.0, 1.0));
}

void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float elev = radians(mix(78.0, 3.0, uIncl));
  float D = 22.0;
  vec3 camPos = D * vec3(0.0, sin(elev), cos(elev));
  vec3 fw = normalize(-camPos);
  vec3 right = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fw);
  vec3 dir = normalize(fw + (vUv.x * right + vUv.y * up) * 0.62);

  vec3 pos = camPos, vel = dir;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);
  vec3 acc = vec3(0.0);
  float alpha = 0.0;
  bool captured = false;
  for (int i = 0; i < 64; i++) {
    float r = length(pos);
    if (r < 1.0) { captured = true; break; }
    // Heading outward beyond the disk (and the bright part of the jet): nothing left to hit.
    if (dot(pos, vel) > 0.0 && r > R_OUT + 2.0 && (uJet == 0.0 || r > 9.0 + abs(pos.y))) break;
    float dt = clamp(0.13 * r, 0.05, 2.5);
    vec3 np = pos + vel * dt;
    vel += -1.5 * h2 * pos / pow(r, 5.0) * dt;
    if (uDisk > 0.0 && sign(np.y) != sign(pos.y)) {
      vec3 P = mix(pos, np, pos.y / (pos.y - np.y));
      vec4 e = diskEmission(P, normalize(vel));
      acc += (1.0 - alpha) * e.rgb * uDisk;
      alpha += (1.0 - alpha) * e.a * uDisk;
    }
    if (uJet > 0.0) {
      float rho = length(np.xz), y = abs(np.y);
      acc += (1.0 - alpha) * vec3(0.45, 0.6, 1.0) * exp(-rho * rho / (0.15 + y * 0.02)) * smoothstep(2.0, 4.0, y) * exp(-y * 0.06) * dt * 0.35 * uJet * (np.y > 0.0 ? 1.0 : 0.3);
    }
    pos = np;
    if (alpha > 0.995) break;
  }
  vec3 col = acc;
  if (!captured) col += (1.0 - alpha) * background(normalize(vel));
  float edge = smoothstep(1.0, 0.85, sqrt(r2));
  float a = captured ? 1.0 : clamp(max(alpha, max(col.r, max(col.g, col.b))), 0.0, 1.0);
  gl_FragColor = vec4(col * edge, a * edge * uOpacity);
}
`;

/* ───────────────────────────── pulsars, nebulae, comets ───────────────────────────── */

/** Pulsar beam on an open cone: flickering streaks fading along its length. Additive HDR. */
export const BEAM_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uTime, uOpacity, uHeight;
uniform vec3 uColor;
varying vec3 vPos;
void main() {
  float h = clamp(vPos.y / uHeight, 0.0, 1.0);
  float around = atan(vPos.z, vPos.x);
  float streaks = 0.65 + 0.35 * snoise(vec3(around * 3.0, h * 6.0 - uTime * 3.0, uTime * 0.5));
  float fade = pow(1.0 - h, 2.2) * smoothstep(0.0, 0.03, h);
  gl_FragColor = vec4(uColor * fade * streaks * 1.6, 1.0) * uOpacity;
}
`;

/**
 * Pulsar wind nebula: a cage of domain-warped filaments (uC0) around a diffuse blue
 * synchrotron glow (uC1), with wisps rippling outward from the centre. Additive HDR.
 */
export const NEBULA_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uTime, uOpacity;
uniform vec3 uC0, uC1;
varying vec2 vUv;
void main() {
  vec2 e = vUv * vec2(1.0, 1.35);
  float r = length(e);
  if (r > 1.0) discard;
  vec3 q = vec3(vUv * 1.6 + 4.3, uTime * 0.008);
  vec3 w = vec3(snoise(q), snoise(q + 5.2), 0.0);
  float fil = 1.0 - abs(snoise(q * 2.6 + w * 1.4));
  fil = pow(smoothstep(0.7, 0.99, fil), 4.0) + 0.5 * pow(1.0 - abs(snoise(q * 5.5 + w)), 14.0);
  float shell = smoothstep(0.3, 0.75, r) * smoothstep(1.0, 0.8, r);
  float body = fbm3(q * 0.8 + w) * 0.5 + 0.5;
  float core = exp(-r * r * 9.0);
  float wisps = 0.5 + 0.5 * sin(r * 40.0 - uTime * 1.2 + body * 6.0);
  vec3 col = uC0 * fil * shell * 0.7 * (0.6 + 0.8 * body)
           + uC1 * (body * 0.22 * smoothstep(1.0, 0.0, r) + core * (0.7 + 0.4 * wisps * smoothstep(0.35, 0.05, r)));
  gl_FragColor = vec4(col, 1.0) * uOpacity;
}
`;

/**
 * Comet tail on a long quad, starting inside the coma (x = 0) as wide as the head and
 * flaring out: striated, flickering, fading with distance. Additive HDR.
 */
export const TAIL_FRAGMENT = /* glsl */ `
${NOISE}
uniform float uTime, uOpacity, uCurve, uHead;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float x = vUv.x * 0.5 + 0.5;                 // 0 at the head, 1 at the end
  float y = vUv.y - uCurve * x * x;
  float width = uHead + 0.5 * x;
  float core = exp(-pow(y / width, 2.0));
  float stri = 0.6 + 0.4 * snoise(vec3(x * 2.0 - uTime * 0.2, y / width * 6.0, uTime * 0.05));
  float knots = 0.8 + 0.4 * fbm3(vec3(x * 6.0 - uTime * 0.35, y * 8.0, 0.0));
  float a = core * stri * knots * pow(1.0 - x, 1.6) * smoothstep(0.0, 0.08, x) * (1.0 + 1.5 * exp(-x * 10.0));
  gl_FragColor = vec4(uColor * a * 1.4, 1.0) * uOpacity;
}
`;

/** Soft glow (coma, neutron-star halo). Additive HDR. */
export const GLOW_FRAGMENT = /* glsl */ `
uniform float uOpacity, uPower, uGain;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float g = pow(1.0 - r, uPower) * smoothstep(1.0, 0.8, r);
  gl_FragColor = vec4(uColor * g * uGain, 1.0) * uOpacity;
}
`;
