import * as Tone from "tone";
import { composeBar, initialState, type BarPlan, type ComposerState, type GuitarTone } from "../composer";
import type { GenrePreset, LayerName } from "../genres";
import type { MusicParams } from "../mapping";
import { NEUTRAL_MIX, type GenreMix } from "../mix";
import { midiToFreq } from "../theory";
import { createInstruments, disposeInstruments, type Instruments } from "./instruments";

/**
 * One object rendered in one genre: instruments, FX and a bar loop, all behind a fade gain.
 * Switching object or genre builds a new scene and crossfades; the transport never stops.
 */
export class MusicScene {
  readonly ready: Promise<void>;
  private out: Tone.Gain;
  private dyn: Tone.Gain;
  private filter: Tone.Filter;
  private reverb: Tone.Reverb;
  private reverbSend: Tone.Gain;
  private delay: Tone.FeedbackDelay;
  private delaySend: Tone.Gain;
  private layers: Record<LayerName, Tone.Gain>;
  private inst: Instruments;
  private loop: Tone.Loop | null = null;
  private bar = 0;
  private bassFreeAt = 0;
  private state: ComposerState;
  private disposed = false;
  /** The guitar's own reverb send, so each phrase can sit closer or further away. */
  private guitarSpace: Tone.Gain | null = null;
  private tone: GuitarTone | null = null;

  constructor(
    readonly params: MusicParams,
    readonly genre: GenrePreset,
    destination: Tone.InputNode,
    private mix: GenreMix = NEUTRAL_MIX,
  ) {
    const p = params;
    this.out = new Tone.Gain(0).connect(destination);
    this.dyn = new Tone.Gain(1).connect(this.out);

    this.reverb = new Tone.Reverb({ decay: p.reverbDecay, preDelay: 0.04, wet: 1 }).connect(this.dyn);
    this.reverbSend = new Tone.Gain(p.reverbWet).connect(this.reverb);
    this.delay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: p.delayFeedback, wet: 1 });
    this.delay.connect(this.dyn);
    this.delay.connect(this.reverbSend);
    this.delaySend = new Tone.Gain(p.delayWet).connect(this.delay);

    this.filter = new Tone.Filter({ type: "lowpass", frequency: p.cutoffHz, Q: 0.7, rolloff: -24 });

    const layer = (name: LayerName, sends: { reverb: boolean; delay: boolean }) => {
      const g = new Tone.Gain(this.layerGain(name)).connect(this.dyn);
      if (sends.reverb) g.connect(this.reverbSend);
      if (sends.delay) g.connect(this.delaySend);
      return g;
    };
    this.layers = {
      pad: layer("pad", { reverb: true, delay: false }),
      bass: layer("bass", { reverb: false, delay: false }),
      lead: layer("lead", { reverb: true, delay: true }),
      texture: layer("texture", { reverb: true, delay: true }),
      // Metal drums sit in a big room; the other kits stay dry.
      drums: layer("drums", { reverb: genre.id === "metal", delay: false }),
      guitar: layer("guitar", { reverb: false, delay: false }),
    };
    if (genre.layers.guitar.enabled) {
      this.guitarSpace = new Tone.Gain(0.5 * mix.space).connect(this.reverb);
      this.layers.guitar.connect(this.guitarSpace);
    }

    this.inst = createInstruments(p, genre, { ...this.layers, filter: this.filter });
    this.state = initialState(p);
    // Swallow late IR completion if the scene was disposed while rendering.
    this.ready = this.reverb.ready.catch(() => {});
  }

  private layerGain(name: LayerName) {
    const cfg = this.genre.layers[name];
    const m = this.mix.layers[name];
    return cfg.enabled && m.on ? Tone.dbToGain(cfg.gainDb + m.db) : 0;
  }

  /**
   * Apply a new listener mix while playing: levels and reverb ramp now; density, register
   * and drive take effect from the next bar the composer writes.
   */
  setMix(mix: GenreMix) {
    if (this.disposed) return;
    this.mix = mix;
    const now = Tone.now();
    for (const name of Object.keys(this.layers) as LayerName[]) this.layers[name].gain.rampTo(this.layerGain(name), 0.15, now);
    this.reverbSend.gain.rampTo(this.params.reverbWet * mix.space, 0.3, now);
    if (this.tone) this.guitarSpace?.gain.rampTo(this.tone.space * mix.space, 0.3, now);
    this.tone = null; // re-apply the guitar tone (drive) on the next bar
  }

  /** Begin on the next beat of the shared transport (not the next bar: that can be 4+ s away). */
  start() {
    this.loop = new Tone.Loop((time) => this.playBar(time), "1m").start("@4n");
  }

  fadeIn(seconds: number) {
    this.out.gain.cancelScheduledValues(Tone.now());
    this.out.gain.rampTo(1, seconds);
  }

  /** Fade out, then free every node once tails have rung out. */
  fadeOutAndDispose(seconds: number) {
    this.out.gain.cancelScheduledValues(Tone.now());
    this.out.gain.rampTo(0, seconds);
    setTimeout(() => this.dispose(), (seconds + 0.5) * 1000);
    // Stop composing new bars halfway through; reverb and releases carry the tail.
    setTimeout(() => this.loop?.stop(), seconds * 500);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.dispose();
    disposeInstruments(this.inst);
    for (const node of [
      ...Object.values(this.layers),
      this.filter,
      this.delaySend,
      ...(this.guitarSpace ? [this.guitarSpace] : []),
      this.delay,
      this.reverbSend,
      this.reverb,
      this.dyn,
      this.out,
    ]) {
      node.dispose();
    }
  }

  private playBar(time: number) {
    if (this.disposed) return;
    const plan = composeBar(this.params, this.genre, this.bar++, this.state, this.mix);
    const spb = 60 / Tone.getTransport().bpm.value;
    this.applyDynamics(plan, time, spb);

    const { pad, bass, lead, texture, guitar, drums, vinyl } = this.inst;
    const at = (beats: number) => time + beats * spb;
    for (const n of plan.pad) pad.triggerAttackRelease(midiToFreq(n.midi), n.dur * spb, at(n.time), n.vel);
    for (const n of plan.bass) {
      // Monophonic: during a tempo ramp a long note could outlast the next attack; Tone requires
      // monotonic automation, so cut the note just before the following one.
      const start = Math.max(at(n.time), this.bassFreeAt);
      const dur = n.dur * spb * 0.96;
      bass.triggerAttackRelease(midiToFreq(n.midi), dur, start, n.vel);
      this.bassFreeAt = start + dur + 0.01;
    }
    for (const n of plan.lead) lead.triggerAttackRelease(midiToFreq(n.midi), n.dur * spb, at(n.time), n.vel);
    for (const n of plan.texture) texture.triggerAttackRelease(midiToFreq(n.midi), n.dur * spb, at(n.time), n.vel);
    if (guitar) {
      if (plan.guitarTone) this.setGuitarTone(plan.guitarTone, time);
      for (const n of plan.guitar) guitar.dirty.triggerAttackRelease(midiToFreq(n.midi), n.dur * spb, at(n.time), n.vel);
      for (const n of plan.clean) guitar.clean.triggerAttackRelease(midiToFreq(n.midi), n.dur * spb, at(n.time), n.vel);
    }
    if (drums) {
      for (const h of plan.drums.kick) drums.kick.triggerAttackRelease("C1", 0.3, at(h.time), h.vel);
      for (const h of plan.drums.snare) drums.snare.triggerAttackRelease(0.15, at(h.time), h.vel);
      for (const h of plan.drums.hat) drums.hat.triggerAttackRelease(0.03, at(h.time), h.vel);
      if (drums.crash) for (const h of plan.drums.crash) drums.crash.triggerAttackRelease(0.5, at(h.time), h.vel);
    }
    if (vinyl) {
      // Random crackle, scheduled in time order (a mono NoiseSynth can't go back in time).
      const beats = Array.from({ length: 3 + Math.floor(Math.random() * 6) }, () => Math.random() * 4).sort((a, b) => a - b);
      for (const b of beats) vinyl.click.triggerAttackRelease(0.005, at(b), 0.2 + Math.random() * 0.5);
    }
  }

  /** New phrase character: gain, attack (pick vs. swell) and how far away it sounds. */
  private setGuitarTone(tone: GuitarTone, time: number) {
    const g = this.inst.guitar;
    const prev = this.tone;
    if (!g || (prev && prev.style === tone.style && prev.drive === tone.drive)) return;
    this.tone = tone;
    if (tone.style === "crunch" || tone.style === "wall") {
      g.drive.distortion = tone.drive;
      g.level.gain.setValueAtTime(1 - 0.45 * tone.drive, time); // more gain, more output: even it out
    }
    g.dirty.set({ envelope: { attack: tone.swell ? 1.6 : 0.004 } });
    g.clean.set({ envelope: { attack: tone.swell ? 0.5 : 0.003 } });
    this.guitarSpace?.gain.linearRampToValueAtTime(tone.space * this.mix.space, time + 2);
  }

  /** Light curve -> level, brightness filter and reverb amount, ramped per beat. */
  private applyDynamics(plan: BarPlan, time: number, spb: number) {
    const { depth } = this.params.dynamics;
    const p = this.params;
    plan.dynamics.forEach((v, b) => {
      const t = time + b * spb;
      this.dyn.gain.linearRampToValueAtTime(1 - depth + depth * v, t);
      this.filter.frequency.linearRampToValueAtTime(p.cutoffHz * (0.55 + 0.9 * v * depth + (1 - depth) * 0.45), t);
      this.reverbSend.gain.linearRampToValueAtTime(p.reverbWet * this.mix.space * (0.75 + 0.5 * (1 - v) * depth), t);
    });
  }
}
