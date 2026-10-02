import type { LightCurve } from "./types";

const N = 128;

const normalize = (xs: number[]) => {
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return xs.map((x) => (hi - lo < 1e-9 ? 1 : (x - lo) / (hi - lo)));
};

const sample = (f: (phase: number) => number) =>
  normalize(Array.from({ length: N }, (_, i) => f(i / N))).map((v) => Math.round(v * 1000) / 1000);

const gauss = (x: number, mu: number, sigma: number) => {
  // wrap around phase 0/1
  const d = Math.min(Math.abs(x - mu), 1 - Math.abs(x - mu));
  return Math.exp(-(d * d) / (2 * sigma * sigma));
};

/**
 * Phase-folded model light curves built from the VSX variability class and period.
 * They are shape templates, not observations — `kind: "model"` says so.
 */
export function modelLightCurve(vsxType: string, periodS: number): LightCurve | null {
  const t = vsxType.toUpperCase();

  // Classical / type II Cepheids, RR Lyrae, delta Scuti: steep rise, slow decline.
  if (/^(DCEP|CEP|CW|RR|DSCT|HADS|SXPHE|ACEP)/.test(t)) {
    return {
      kind: "model",
      period_s: periodS,
      samples: sample((p) => (p < 0.18 ? p / 0.18 : 1 - (p - 0.18) / 0.82) ** 1.4),
      shape: "pulsating",
    };
  }
  // Algol-type eclipsing binaries: flat with a deep primary and a shallow secondary eclipse.
  if (/^E(A|B|W)?/.test(t)) {
    const secondary = t.startsWith("EA") ? 0.08 : t.startsWith("EW") ? 0.85 : 0.4;
    const width = t.startsWith("EA") ? 0.035 : 0.12;
    return {
      kind: "model",
      period_s: periodS,
      samples: sample((p) => 1 - gauss(p, 0, width) - secondary * gauss(p, 0.5, width)),
      shape: "eclipsing",
    };
  }
  // Semi-regular, Mira and slow irregular variables: smooth, slightly asymmetric wave.
  if (/^(SR|M$|M:|L|RV|LB|LC)/.test(t)) {
    return {
      kind: "model",
      period_s: periodS,
      samples: sample((p) => Math.sin(2 * Math.PI * p) + 0.3 * Math.sin(4 * Math.PI * p + 0.7)),
      shape: "semiregular",
    };
  }
  return {
    kind: "model",
    period_s: periodS,
    samples: sample((p) => Math.sin(2 * Math.PI * p)),
    shape: "sine",
  };
}

/** Pulse profile: a narrow main pulse; Crab-like young pulsars also show an interpulse. */
export function pulsarProfile(periodS: number, interpulse: boolean): LightCurve {
  return {
    kind: "model",
    period_s: periodS,
    samples: sample((p) => gauss(p, 0.1, 0.02) + (interpulse ? 0.4 * gauss(p, 0.5, 0.025) : 0)),
    shape: interpulse ? "pulse_interpulse" : "pulse",
  };
}
