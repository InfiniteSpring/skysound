import * as Tone from "tone";
import type { SpaceObject } from "../../sources/types";
import { GENRES, type GenreId } from "../genres";
import { mapToMusic, type MusicParams } from "../mapping";
import { MusicScene } from "./scene";

export type AudioObject = Pick<SpaceObject, "slug" | "name" | "type" | "params" | "lightCurve">;

export interface NowPlaying {
  slug: string;
  name: string;
  genre: GenreId;
  music: MusicParams;
}

export const DEFAULT_FADE_S = 6;

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
  async play(object: AudioObject, genreId: GenreId, fadeS = DEFAULT_FADE_S) {
    const token = ++this.token;
    const genre = GENRES[genreId];
    const music = mapToMusic(object, genre);
    const scene = new MusicScene(music, genre, this.bus);
    await scene.ready;
    if (token !== this.token) {
      scene.dispose();
      return;
    }

    const transport = Tone.getTransport();
    if (transport.state !== "started") {
      transport.bpm.value = music.bpm;
      transport.start("+0.05");
      this.volume.volume.rampTo(this.userVolumeDb, 0.3);
    } else {
      transport.bpm.rampTo(music.bpm, fadeS);
    }

    scene.start();
    scene.fadeIn(this.current ? fadeS : 2);
    if (this.current) {
      const old = this.current;
      this.fading.add(old);
      old.fadeOutAndDispose(fadeS);
      setTimeout(() => this.fading.delete(old), (fadeS + 1) * 1000);
    }
    this.current = scene;
    this.nowPlaying = { slug: object.slug, name: object.name, genre: genreId, music };
  }

  get isPlaying() {
    return Tone.getTransport().state === "started";
  }

  pause() {
    this.volume.volume.rampTo(-80, 0.4);
    setTimeout(() => Tone.getTransport().pause(), 450);
  }

  resume() {
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
