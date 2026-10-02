import * as Tone from "tone";
import { composeBar, initialState, type BarPlan, type ComposerState } from "../composer";
import type { GenrePreset, LayerName } from "../genres";
import type { MusicParams } from "../mapping";
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

  constructor(
    readonly params: MusicParams,
    readonly genre: GenrePreset,
    destination: Tone.InputNode,
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
      const cfg = genre.layers[name];
      const g = new Tone.Gain(cfg.enabled ? Tone.dbToGain(cfg.gainDb) : 0).connect(this.dyn);
      if (sends.reverb) g.connect(this.reverbSend);
      if (sends.delay) g.connect(this.delaySend);
      return g;
    };
    this.layers = {
      pad: layer("pad", { reverb: true, delay: false }),
      bass: layer("bass", { reverb: false, delay: false }),
      lead: layer("lead", { reverb: true, delay: true }),
      texture: layer("texture", { reverb: true, delay: true }),
      drums: layer("drums", { reverb: false, delay: false }),
    };

    this.inst = createInstruments(p, genre, { ...this.layers, filter: this.filter });
    this.state = initialState(p);
    // Swallow late IR completion if the scene was disposed while rendering.
    this.ready = this.reverb.ready.catch(() => {});
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
    const plan = composeBar(this.params, this.genre, this.bar++, this.state);
    const spb = 60 / Tone.getTransport().bpm.value;
    this.applyDynamics(plan, time, spb);

    const { pad, bass, lead, texture, drums, vinyl } = this.inst;
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
    if (drums) {
      for (const h of plan.drums.kick) drums.kick.triggerAttackRelease("C1", 0.3, at(h.time), h.vel);
      for (const h of plan.drums.snare) drums.snare.triggerAttackRelease(0.15, at(h.time), h.vel);
      for (const h of plan.drums.hat) drums.hat.triggerAttackRelease(0.03, at(h.time), h.vel);
    }
    if (vinyl) {
      // Random crackle, scheduled in time order (a mono NoiseSynth can't go back in time).
      const beats = Array.from({ length: 3 + Math.floor(Math.random() * 6) }, () => Math.random() * 4).sort((a, b) => a - b);
      for (const b of beats) vinyl.click.triggerAttackRelease(0.005, at(b), 0.2 + Math.random() * 0.5);
    }
  }

  /** Light curve -> level, brightness filter and reverb amount, ramped per beat. */
  private applyDynamics(plan: BarPlan, time: number, spb: number) {
    const { depth } = this.params.dynamics;
    const p = this.params;
    plan.dynamics.forEach((v, b) => {
      const t = time + b * spb;
      this.dyn.gain.linearRampToValueAtTime(1 - depth + depth * v, t);
      this.filter.frequency.linearRampToValueAtTime(p.cutoffHz * (0.55 + 0.9 * v * depth + (1 - depth) * 0.45), t);
      this.reverbSend.gain.linearRampToValueAtTime(p.reverbWet * (0.75 + 0.5 * (1 - v) * depth), t);
    });
  }
}
