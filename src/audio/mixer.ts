/** Stereo mixer: gain, equal-power pan, a shared reverb bus, and peak normalization. */

export interface MixTrack {
  name: string;
  audio: Float32Array;
  /** Linear gain applied to the track. */
  gain: number;
  /** -1 = left, 0 = centre, 1 = right. */
  pan: number;
  /** Reverb send level, 0..1. */
  reverb: number;
}

export interface MixOptions {
  /** Level of the reverb return. Default 0.35; 0 disables reverb. */
  reverbLevel?: number;
  /** Peak level of the final mix. Default 0.89 (about -1 dBFS). */
  targetPeak?: number;
}

export function peak(audio: Float32Array): number {
  let p = 0;
  for (let i = 0; i < audio.length; i++) {
    const a = Math.abs(audio[i]!);
    if (a > p) p = a;
  }
  return p;
}

/** Scale in place so the loudest sample is `target`. Silent audio is left alone. */
export function normalize(audio: Float32Array, target = 0.9): Float32Array {
  const p = peak(audio);
  if (p > 0) {
    const g = target / p;
    for (let i = 0; i < audio.length; i++) audio[i] = audio[i]! * g;
  }
  return audio;
}

export function mixTracks(
  tracks: MixTrack[],
  sampleRate: number,
  options: MixOptions = {},
): [Float32Array, Float32Array] {
  const length = tracks.reduce((m, t) => Math.max(m, t.audio.length), 0);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const send = new Float32Array(length);

  for (const track of tracks) {
    const pan = Math.max(-1, Math.min(1, track.pan));
    const angle = ((pan + 1) * Math.PI) / 4;
    // Equal-power pan, scaled so a centred track keeps unity gain per side.
    const gl = Math.cos(angle) * Math.SQRT2 * track.gain;
    const gr = Math.sin(angle) * Math.SQRT2 * track.gain;
    const gs = track.gain * Math.max(0, track.reverb);
    const a = track.audio;
    for (let i = 0; i < a.length; i++) {
      const s = a[i]!;
      left[i] = left[i]! + s * gl;
      right[i] = right[i]! + s * gr;
      send[i] = send[i]! + s * gs;
    }
  }

  const level = options.reverbLevel ?? 0.35;
  if (level > 0) {
    const wetL = reverb(send, sampleRate, 0);
    const wetR = reverb(send, sampleRate, 23); // offset delay lines for stereo width
    for (let i = 0; i < length; i++) {
      left[i] = left[i]! + wetL[i]! * level;
      right[i] = right[i]! + wetR[i]! * level;
    }
  }

  const target = options.targetPeak ?? 0.89;
  const p = Math.max(peak(left), peak(right));
  if (p > 0) {
    const g = target / p;
    for (let i = 0; i < length; i++) {
      left[i] = left[i]! * g;
      right[i] = right[i]! * g;
    }
  }
  return [left, right];
}

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491];
const ALLPASSES = [556, 441, 341];

/** Freeverb-style reverb: parallel damped comb filters into series allpasses. */
export function reverb(
  input: Float32Array,
  sampleRate: number,
  spread = 0,
  roomSize = 0.84,
  damp = 0.25,
): Float32Array {
  const scale = sampleRate / 44100;
  const out = new Float32Array(input.length);
  for (const base of COMBS) {
    const size = Math.max(1, Math.round((base + spread) * scale));
    const buf = new Float32Array(size);
    let idx = 0;
    let store = 0;
    for (let i = 0; i < input.length; i++) {
      const y = buf[idx]!;
      store = y * (1 - damp) + store * damp;
      buf[idx] = input[i]! + store * roomSize;
      out[i] = out[i]! + y;
      idx = idx + 1 === size ? 0 : idx + 1;
    }
  }
  for (const base of ALLPASSES) {
    const size = Math.max(1, Math.round((base + spread) * scale));
    const buf = new Float32Array(size);
    let idx = 0;
    for (let i = 0; i < out.length; i++) {
      const delayed = buf[idx]!;
      const x = out[i]!;
      out[i] = delayed - x;
      buf[idx] = x + delayed * 0.5;
      idx = idx + 1 === size ? 0 : idx + 1;
    }
  }
  const g = 1 / COMBS.length;
  for (let i = 0; i < out.length; i++) out[i] = out[i]! * g;
  return out;
}
