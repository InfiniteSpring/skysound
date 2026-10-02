import * as Tone from "tone";
import type { GenrePreset } from "../genres";
import type { MusicParams } from "../mapping";

type Poly = Tone.PolySynth<Tone.Synth> | Tone.PolySynth<Tone.FMSynth>;

export interface Instruments {
  pad: Poly;
  bass: Tone.MonoSynth;
  lead: Poly;
  texture: Poly;
  drums: { kick: Tone.MembraneSynth; snare: Tone.NoiseSynth; hat: Tone.NoiseSynth } | null;
  vinyl: { noise: Tone.Noise; click: Tone.NoiseSynth } | null;
  /** Nodes owned by the instruments (filters, chorus) that must be disposed with them. */
  extras: Tone.ToneAudioNode[];
}

export interface LayerOutputs {
  pad: Tone.InputNode;
  bass: Tone.InputNode;
  lead: Tone.InputNode;
  texture: Tone.InputNode;
  drums: Tone.InputNode;
  /** Brightness filter shared by pad/lead; its cutoff follows the light curve. */
  filter: Tone.Filter;
}

const PAD_OSC = { dark: "fattriangle", warm: "fatsawtooth", glass: "fatsine", bell: "fatsine" } as const;

export function createInstruments(p: MusicParams, genre: GenrePreset, out: LayerOutputs): Instruments {
  const extras: Tone.ToneAudioNode[] = [];

  // Pad
  let pad: Poly;
  if (genre.instruments.pad === "drone") {
    pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: PAD_OSC[p.timbre], count: 3, spread: 22 },
      envelope: { attack: 1.2, decay: 1.5, sustain: 0.8, release: 4 },
    });
  } else {
    pad = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3,
      modulationIndex: 1.2 + p.brightness * 1.8,
      oscillator: { type: "sine" },
      modulation: { type: "sine" },
      envelope: { attack: 0.006, decay: 1.4, sustain: 0.2, release: 1.4 },
      modulationEnvelope: { attack: 0.01, decay: 0.6, sustain: 0.1, release: 0.8 },
    });
  }
  pad.maxPolyphony = 16;
  const chorus = new Tone.Chorus({ frequency: 0.25, delayTime: 4, depth: 0.5, wet: 0.35 }).start();
  pad.chain(out.filter, chorus, out.pad);
  extras.push(chorus);

  // Bass
  const bass =
    genre.instruments.bass === "sub"
      ? new Tone.MonoSynth({
          oscillator: { type: "sine" },
          envelope: { attack: 0.9, decay: 0.6, sustain: 0.9, release: 2.5 },
          filter: { Q: 0.5, type: "lowpass", rolloff: -12 },
          filterEnvelope: { attack: 0.5, decay: 1, sustain: 1, release: 2, baseFrequency: 180, octaves: 1.2 },
        })
      : new Tone.MonoSynth({
          oscillator: { type: "triangle" },
          envelope: { attack: 0.01, decay: 0.35, sustain: 0.5, release: 0.4 },
          filter: { Q: 1, type: "lowpass", rolloff: -24 },
          filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.3, baseFrequency: 160, octaves: 2.2 },
        });
  bass.connect(out.bass);

  // Lead
  const lead =
    genre.instruments.lead === "glass"
      ? new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: p.timbre === "warm" ? "triangle" : "sine" },
          envelope: { attack: 0.35, decay: 1.2, sustain: 0.5, release: 3.5 },
        })
      : new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.004, decay: 0.5, sustain: 0.15, release: 0.6 },
        });
  lead.maxPolyphony = 8;
  const leadFilter = new Tone.Filter({ type: "lowpass", frequency: Math.min(9000, p.cutoffHz * 1.6), Q: 0.3 });
  lead.chain(leadFilter, out.lead);
  extras.push(leadFilter);

  // Texture: bell ticks for pulsars / high shimmer otherwise
  const texture = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: p.pulse.enabled ? 5.1 : 2.5,
    modulationIndex: p.pulse.enabled ? 4 : 1.5,
    envelope: p.pulse.enabled
      ? { attack: 0.001, decay: 0.09, sustain: 0, release: 0.12 }
      : { attack: 0.02, decay: 2.2, sustain: 0, release: 2.4 },
    modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 },
  });
  texture.maxPolyphony = 12;
  const textureHp = new Tone.Filter({ type: "highpass", frequency: 900 });
  texture.chain(textureHp, out.texture);
  extras.push(textureHp);

  // Drums
  let drums: Instruments["drums"] = null;
  if (genre.instruments.drums === "boombap") {
    const dusty = new Tone.Filter({ type: "lowpass", frequency: 5200, Q: 0.4 }).connect(out.drums);
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.045,
      octaves: 5,
      envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.1 },
    }).connect(dusty);
    const snareBp = new Tone.Filter({ type: "bandpass", frequency: 1900, Q: 0.8 }).connect(dusty);
    const snare = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.19, sustain: 0, release: 0.05 },
    }).connect(snareBp);
    const hatHp = new Tone.Filter({ type: "highpass", frequency: 7000 }).connect(dusty);
    const hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.02 },
    }).connect(hatHp);
    drums = { kick, snare, hat };
    extras.push(dusty, snareBp, hatHp);
  }

  // Vinyl: faint filtered noise bed plus random crackles
  let vinyl: Instruments["vinyl"] = null;
  if (genre.instruments.texture === "vinyl") {
    const bed = new Tone.Filter({ type: "bandpass", frequency: 2600, Q: 0.5 }).connect(out.texture);
    const bedGain = new Tone.Gain(0.25).connect(bed);
    const noise = new Tone.Noise("brown").connect(bedGain).start();
    const crackleHp = new Tone.Filter({ type: "highpass", frequency: 3000 }).connect(out.texture);
    const click = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.0005, decay: 0.006, sustain: 0, release: 0.004 },
    }).connect(crackleHp);
    vinyl = { noise, click };
    extras.push(bed, bedGain, crackleHp);
  }

  return { pad, bass, lead, texture, drums, vinyl, extras };
}

export function disposeInstruments(i: Instruments) {
  i.vinyl?.noise.stop();
  for (const node of [i.pad, i.bass, i.lead, i.texture, i.drums?.kick, i.drums?.snare, i.drums?.hat, i.vinyl?.noise, i.vinyl?.click, ...i.extras]) {
    node?.dispose();
  }
}
