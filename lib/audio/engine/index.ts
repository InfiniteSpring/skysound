import * as Tone from "tone";
import type { SpaceObject } from "../../sources/types";
import { GENRES, type GenreId } from "../genres";
import { mapToMusic, type MusicParams } from "../mapping";
import { mixedBpm, NEUTRAL_MIX, type GenreMix } from "../mix";
import { MusicScene } from "./scene";

export type AudioObject = Pick<SpaceObject, "slug" | "name" | "type" | "params" | "lightCurve">;

export interface NowPlaying {
  slug: string;
  name: string;
  genre: GenreId;
  /** Music as played, with the listener's tempo change applied to `bpm`. */
  music: MusicParams;
  /** The object's own tempo before the mix. */
  baseBpm: number;
}

export const DEFAULT_FADE_S = 3;
/** The very first track only needs a short fade-in from silence. */
const FIRST_FADE_S = 0.8;

/**
 * Owns the Tone context, the shared transport and the master chain. Must be constructed
 * with an AudioContext created inside a user gesture.
 */
export class AudioEngine {
  private bus: Tone.Gain;
  private compressor: Tone.Compressor;
  private limiter: Tone.Limiter;
  private volume: Tone.Volume;
  private current: MusicScene | null = null;
  private fading = new Set<MusicScene>();
  private token = 0;
  private userVolumeDb = -3;
  /** Pending transport stop after a pause fade; must not fire once playback resumes. */
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  nowPlaying: NowPlaying | null = null;

  constructor(context: AudioContext) {
    Tone.setContext(context);
    // Headroom chain: scenes sum into the bus; a gentle compressor glues, the limiter guards 0 dBFS.
    this.volume = new Tone.Volume(-3).toDestination();
    this.limiter = new Tone.Limiter(-1.5).connect(this.volume);
    this.compressor = new Tone.Compressor({ threshold: -20, ratio: 2.5, attack: 0.08, release: 0.4 }).connect(this.limiter);
    this.bus = new Tone.Gain(1).connect(this.compressor);
    Tone.getTransport().bpm.value = 70;
  }

  /** Crossfade to `object` in `genre`. Safe to call rapidly: only the latest request wins. */
  play(object: AudioObject, genreId: GenreId, fadeS = DEFAULT_FADE_S, mix: GenreMix = NEUTRAL_MIX) {
    const token = ++this.token;
    this.cancelPendingPause();
    const genre = GENRES[genreId];
    const base = mapToMusic(object, genre);
    const music = { ...base, bpm: mixedBpm(base.bpm, mix) };
    // Don't wait for the reverb impulse response: the dry signal starts right away and the
    // reverb tail joins as soon as the IR is rendered (it is silent until then).
    const scene = new MusicScene(music, genre, this.bus, mix);
    if (token !== this.token) {
      scene.dispose();
      return;
    }

    const transport = Tone.getTransport();
    if (transport.state !== "started") {
      transport.bpm.value = music.bpm;
      transport.start("+0.05");
    } else {
      transport.bpm.rampTo(music.bpm, fadeS);
    }
    // Undo a pause fade (possibly still in progress) — a new pick always plays audibly.
    this.volume.volume.rampTo(this.userVolumeDb, 0.3);

    scene.start();
    scene.fadeIn(this.current ? fadeS : FIRST_FADE_S);
    if (this.current) {
      const old = this.current;
      this.fading.add(old);
      old.fadeOutAndDispose(fadeS);
      setTimeout(() => this.fading.delete(old), (fadeS + 1) * 1000);
    }
    this.current = scene;
    this.nowPlaying = { slug: object.slug, name: object.name, genre: genreId, music, baseBpm: base.bpm };
  }

  /** Change the listener mix of the playing genre live (no crossfade). */
  setMix(genreId: GenreId, mix: GenreMix) {
    const np = this.nowPlaying;
    if (!this.current || !np || np.genre !== genreId) return;
    this.current.setMix(mix);
    const bpm = mixedBpm(np.baseBpm, mix);
    if (bpm !== np.music.bpm) {
      Tone.getTransport().bpm.rampTo(bpm, 0.6);
      this.nowPlaying = { ...np, music: { ...np.music, bpm } };
    }
  }

  get isPlaying() {
    return Tone.getTransport().state === "started";
  }

  pause() {
    this.cancelPendingPause();
    this.volume.volume.rampTo(-80, 0.4);
    this.pauseTimer = setTimeout(() => {
      this.pauseTimer = null;
      Tone.getTransport().pause();
    }, 450);
  }

  private cancelPendingPause() {
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
  }

  resume() {
    this.cancelPendingPause();
    const ctx = Tone.getContext();
    if (ctx.state !== "running") void ctx.resume();
    Tone.getTransport().start();
    this.volume.volume.rampTo(this.userVolumeDb, 0.6);
  }

  /** 0..1 slider -> dB with a usable taper. */
  setVolume(level: number) {
    this.userVolumeDb = level <= 0.001 ? -80 : 20 * Math.log10(level) - 3;
    this.volume.volume.rampTo(this.userVolumeDb, 0.15);
  }

  dispose() {
    this.current?.dispose();
    this.fading.forEach((s) => s.dispose());
    Tone.getTransport().stop();
    for (const n of [this.bus, this.compressor, this.limiter, this.volume]) n.dispose();
  }
}
