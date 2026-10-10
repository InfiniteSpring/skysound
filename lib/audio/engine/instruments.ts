import * as Tone from "tone";
import type { GenrePreset } from "../genres";
import type { MusicParams } from "../mapping";

type Poly = Tone.PolySynth<Tone.Synth> | Tone.PolySynth<Tone.FMSynth>;

export interface Instruments {
  pad: Poly;
  bass: Tone.MonoSynth;
  lead: Poly;
  texture: Poly;
  /** Distorted guitar, its drive stage and make-up gain (tone is set per phrase). */
  guitar: { dirty: Tone.PolySynth<Tone.Synth>; drive: Tone.Distortion; level: Tone.Gain; clean: Tone.PolySynth<Tone.Synth> } | null;
  drums: { kick: Tone.MembraneSynth; snare: Tone.NoiseSynth; hat: Tone.NoiseSynth; crash: Tone.NoiseSynth | null } | null;
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
  guitar: Tone.InputNode;
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
  } else if (genre.instruments.pad === "choir") {
    // Dark choir: detuned saws through a vowel-like formant (an "oh" around 450 Hz).
    pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 4, spread: 30 },
      envelope: { attack: 2.2, decay: 1, sustain: 0.85, release: 5 },
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
  if (genre.instruments.pad === "choir") {
    const formant = new Tone.Filter({ type: "bandpass", frequency: 450, Q: 1.4 });
    const air = new Tone.Filter({ type: "lowpass", frequency: 1800, rolloff: -24 });
    pad.chain(formant, air, chorus, out.pad);
    extras.push(formant, air);
  } else {
    pad.chain(out.filter, chorus, out.pad);
  }
  extras.push(chorus);

  // Bass
  const bass =
    genre.instruments.bass === "grit"
      ? new Tone.MonoSynth({
          oscillator: { type: "sawtooth" },
          envelope: { attack: 0.02, decay: 0.5, sustain: 0.85, release: 1.2 },
          filter: { Q: 1.2, type: "lowpass", rolloff: -24 },
          filterEnvelope: { attack: 0.01, decay: 0.4, sustain: 0.5, release: 1, baseFrequency: 90, octaves: 2.4 },
        })
      : genre.instruments.bass === "sub"
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
    genre.instruments.lead === "bell"
      ? // A tolling bell: inharmonic FM with a long ring.
        new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 1.41,
          modulationIndex: 5,
          oscillator: { type: "sine" },
          modulation: { type: "sine" },
          envelope: { attack: 0.002, decay: 4, sustain: 0, release: 4 },
          modulationEnvelope: { attack: 0.002, decay: 1.6, sustain: 0, release: 2 },
        })
      : genre.instruments.lead === "glass"
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

  // Guitars. Dirty: detuned saws -> distortion (amount set per phrase) -> a cabinet-ish EQ.
  // Clean: a plucked, chorused tone with its own dotted-eighth echo, for arpeggios.
  let guitar: Instruments["guitar"] = null;
  if (genre.instruments.guitar === "heavy") {
    const dirty = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 2, spread: 12 },
      envelope: { attack: 0.004, decay: 0.4, sustain: 0.8, release: 1.2 },
    });
    dirty.maxPolyphony = 10;
    const drive = new Tone.Distortion({ distortion: 0.5, oversample: "4x" });
    const lowCut = new Tone.Filter({ type: "highpass", frequency: 70, Q: 0.7 });
    const scoop = new Tone.Filter({ type: "peaking", frequency: 750, Q: 0.9, gain: -5 });
    const cab = new Tone.Filter({ type: "lowpass", frequency: 3000, Q: 0.8, rolloff: -24 });
    const level = new Tone.Gain(0.8);
    dirty.chain(drive, lowCut, scoop, cab, level, out.guitar);

    const clean = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 2, spread: 7 },
      envelope: { attack: 0.003, decay: 1.6, sustain: 0.12, release: 2.6 },
    });
    clean.maxPolyphony = 10;
    const tone = new Tone.Filter({ type: "lowpass", frequency: 2200, Q: 0.5, rolloff: -24 });
    const shimmer = new Tone.Chorus({ frequency: 0.6, delayTime: 3.5, depth: 0.6, wet: 0.5 }).start();
    const echo = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.38, wet: 0.3 });
    const cleanLevel = new Tone.Gain(0.9);
    clean.chain(tone, shimmer, echo, cleanLevel, out.guitar);

    guitar = { dirty, drive, level, clean };
    extras.push(drive, lowCut, scoop, cab, level, tone, shimmer, echo, cleanLevel);
  }

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
    drums = { kick, snare, hat, crash: null };
    extras.push(dusty, snareBp, hatHp);
  } else if (genre.instruments.drums === "room") {
    // Big, slow kit: a deep kick, a fat snare, a ride and a crash (the room comes from the reverb send).
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.07,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.7, sustain: 0, release: 0.2 },
    }).connect(out.drums);
    const snareBp = new Tone.Filter({ type: "bandpass", frequency: 1400, Q: 0.6 }).connect(out.drums);
    const snare = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.1 },
    }).connect(snareBp);
    const rideHp = new Tone.Filter({ type: "highpass", frequency: 6500 }).connect(out.drums);
    const hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.2 },
    }).connect(rideHp);
    const crashHp = new Tone.Filter({ type: "highpass", frequency: 4200 }).connect(out.drums);
    const crash = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.002, decay: 2.4, sustain: 0, release: 1.2 },
    }).connect(crashHp);
    drums = { kick, snare, hat, crash };
    extras.push(snareBp, rideHp, crashHp);
  }

  // Ash: a cold wind bed, slowly swept band-passed noise.
  if (genre.instruments.texture === "ash") {
    const wind = new Tone.AutoFilter({ frequency: 0.05, baseFrequency: 180, octaves: 2.6, filter: { type: "bandpass", Q: 2.5, rolloff: -12 } })
      .connect(out.texture)
      .start();
    const windGain = new Tone.Gain(0.9).connect(wind);
    const windNoise = new Tone.Noise("brown").connect(windGain).start();
    extras.push(wind, windGain, windNoise);
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

  return { pad, bass, lead, texture, guitar, drums, vinyl, extras };
}

export function disposeInstruments(i: Instruments) {
  i.vinyl?.noise.stop();
  for (const node of i.extras) if (node instanceof Tone.Noise) node.stop();
  for (const node of [i.pad, i.bass, i.lead, i.texture, i.guitar?.dirty, i.guitar?.clean, i.drums?.kick, i.drums?.snare, i.drums?.hat, i.drums?.crash, i.vinyl?.noise, i.vinyl?.click, ...i.extras]) {
    node?.dispose();
  }
}
