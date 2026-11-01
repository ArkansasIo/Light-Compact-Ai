/**
 * Built-in instruments, synthesized in code (no sample libraries needed):
 *
 *   piano    additive partials with slight inharmonicity and per-partial decay
 *   harp     Karplus-Strong plucked string
 *   strings  detuned sawtooth ensemble, low-passed, slow attack, light vibrato
 *   pad      soft detuned saws with a long attack
 *   bass     sine with a little 2nd/3rd harmonic, plucked envelope
 *   bells    two-operator FM bell
 *   drums    synthesized kick (36), snare (38), hi-hat (42), cymbal (49)
 *
 * Choir parts are sung by the singing engine, not rendered here.
 */
import type { NoteEvent } from "../audio/types.js";
import type { Transport } from "../audio/transport.js";
import type { InstrumentName } from "../music/composer.js";
import { createRng, type Rng } from "../music/random.js";
import { midiToFrequency } from "../music/theory.js";

const TAU = Math.PI * 2;

interface NoteContext {
  out: Float32Array;
  start: number;
  /** Held length in samples. */
  hold: number;
  sr: number;
  freq: number;
  vel: number;
  rng: Rng;
}

const add = (out: Float32Array, i: number, v: number) => {
  if (i >= 0 && i < out.length) out[i] = out[i]! + v;
};

function piano({ out, start, hold, sr, freq, vel }: NoteContext): void {
  const release = Math.round(0.25 * sr);
  const total = Math.min(hold + release, Math.round(6 * sr));
  const partials: { w: number; amp: number; decay: number }[] = [];
  for (let k = 1; k <= 10; k++) {
    const f = freq * k * Math.sqrt(1 + 0.0004 * k * k);
    if (f > sr * 0.45) break;
    partials.push({
      w: (TAU * f) / sr,
      amp: (1 / k ** 1.3) * (k === 1 ? 1 : 0.4 + 0.6 * vel),
      decay: Math.exp(-((0.6 + 0.45 * k) * (1 + freq / 1000)) / sr),
    });
  }
  const env = partials.map(() => 1);
  const attack = Math.round(0.004 * sr);
  for (let i = 0; i < total; i++) {
    let s = 0;
    for (let p = 0; p < partials.length; p++) {
      const part = partials[p]!;
      s += Math.sin(part.w * i) * part.amp * env[p]!;
      env[p] = env[p]! * part.decay;
    }
    let a = i < attack ? i / attack : 1;
    if (i > hold) a *= Math.exp(-(i - hold) / (0.06 * sr));
    add(out, start + i, s * a * vel * 0.3);
  }
}

function harp({ out, start, hold, sr, freq, vel, rng }: NoteContext): void {
  const n = Math.max(2, Math.round(sr / freq));
  const buf = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const noise = rng() * 2 - 1;
    prev = prev * 0.5 + noise * 0.5; // softer pluck
    buf[i] = prev * vel;
  }
  const total = Math.min(
    Math.max(hold, Math.round(0.4 * sr)) + Math.round(1.5 * sr),
    Math.round(5 * sr),
  );
  const damp = 0.4985 + Math.min(0.0012, 60 / freq / 1000);
  let idx = 0;
  for (let i = 0; i < total; i++) {
    const y = buf[idx]!;
    const next = buf[(idx + 1) % n]!;
    buf[idx] = (y + next) * damp;
    idx = (idx + 1) % n;
    const fade = i > total - 0.2 * sr ? (total - i) / (0.2 * sr) : 1;
    add(out, start + i, y * 0.6 * fade);
  }
}

function sawEnsemble(
  { out, start, hold, sr, freq, vel, rng }: NoteContext,
  detunes: number[],
  attackSec: number,
  releaseSec: number,
  cutoff: number,
  level: number,
): void {
  const attack = Math.round(attackSec * sr);
  const release = Math.round(releaseSec * sr);
  const total = hold + release;
  const phases = detunes.map(() => rng());
  const alpha = 1 - Math.exp((-TAU * cutoff) / sr);
  let lp = 0;
  let lp2 = 0;
  for (let i = 0; i < total; i++) {
    const t = i / sr;
    const vib = 1 + 0.003 * Math.sin(TAU * 5 * t) * Math.min(1, t / 0.5);
    let s = 0;
    for (let d = 0; d < detunes.length; d++) {
      phases[d] = (phases[d]! + (freq * vib * (1 + detunes[d]!)) / sr) % 1;
      s += 2 * phases[d]! - 1;
    }
    s /= detunes.length;
    lp += alpha * (s - lp);
    lp2 += alpha * (lp - lp2);
    let env = i < attack ? i / attack : 1;
    if (i > hold) env *= 1 - (i - hold) / release;
    add(out, start + i, lp2 * env * vel * level);
  }
}

function bass({ out, start, hold, sr, freq, vel }: NoteContext): void {
  const release = Math.round(0.08 * sr);
  const total = hold + release;
  const w = (TAU * freq) / sr;
  for (let i = 0; i < total; i++) {
    const t = i / sr;
    const s =
      Math.sin(w * i) + 0.35 * Math.sin(2 * w * i) + 0.1 * Math.sin(3 * w * i);
    let env = Math.min(1, i / (0.005 * sr)) * Math.exp(-t * 1.2);
    if (i > hold) env *= 1 - (i - hold) / release;
    add(out, start + i, s * env * vel * 0.45);
  }
}

function bells({ out, start, sr, freq, vel }: NoteContext): void {
  const total = Math.round(3 * sr);
  for (let i = 0; i < total; i++) {
    const t = i / sr;
    const index = 2.5 * Math.exp(-t * 3);
    const s = Math.sin(TAU * freq * t + index * Math.sin(TAU * freq * 3.5 * t));
    const env = Math.min(1, i / (0.002 * sr)) * Math.exp(-t * 1.6);
    add(out, start + i, s * env * vel * 0.5);
  }
}

function drum(pitch: number, { out, start, sr, vel, rng }: NoteContext): void {
  if (pitch === 36) {
    const total = Math.round(0.4 * sr);
    let phase = 0;
    for (let i = 0; i < total; i++) {
      const t = i / sr;
      phase += (TAU * (48 + 90 * Math.exp(-t * 35))) / sr;
      add(out, start + i, Math.sin(phase) * Math.exp(-t * 9) * vel);
    }
    return;
  }
  if (pitch === 38) {
    const total = Math.round(0.25 * sr);
    for (let i = 0; i < total; i++) {
      const t = i / sr;
      const s =
        (rng() * 2 - 1) * Math.exp(-t * 22) * 0.55 +
        Math.sin(TAU * 190 * t) * Math.exp(-t * 28) * 0.4;
      add(out, start + i, s * vel * 0.8);
    }
    return;
  }
  // Hi-hat (42) and cymbal (49): high-passed noise, short or long.
  const long = pitch === 49;
  const total = Math.round((long ? 1.8 : 0.08) * sr);
  let prev = 0;
  for (let i = 0; i < total; i++) {
    const t = i / sr;
    const noise = rng() * 2 - 1;
    const hp = noise - prev;
    prev = noise;
    add(
      out,
      start + i,
      hp * Math.exp(-t * (long ? 2.5 : 60)) * vel * (long ? 0.25 : 0.35),
    );
  }
}

/** Render every note of one instrument into a mono buffer of `totalSamples`. */
export function renderInstrument(
  instrument: Exclude<InstrumentName, "choir">,
  notes: NoteEvent[],
  transport: Transport,
  totalSamples: number,
  seed = 1,
): Float32Array {
  const out = new Float32Array(totalSamples);
  const rng = createRng(seed);
  const sr = transport.sampleRate;
  for (const n of notes) {
    const start = transport.beatsToSamples(n.startBeats);
    if (start >= totalSamples) continue;
    const ctx: NoteContext = {
      out,
      start,
      hold: Math.max(1, transport.beatsToSamples(n.durationBeats)),
      sr,
      freq: midiToFrequency(n.pitch),
      vel: Math.max(0.05, Math.min(1, (n.velocity ?? 80) / 127)),
      rng,
    };
    switch (instrument) {
      case "piano":
        piano(ctx);
        break;
      case "harp":
        harp(ctx);
        break;
      case "strings":
        sawEnsemble(ctx, [-0.004, 0, 0.005], 0.25, 0.45, 2200, 0.4);
        break;
      case "pad":
        sawEnsemble(ctx, [-0.006, 0.006], 0.8, 1.2, 1100, 0.45);
        break;
      case "bass":
        bass(ctx);
        break;
      case "bells":
        bells(ctx);
        break;
      case "drums":
        drum(n.pitch, ctx);
        break;
    }
  }
  return out;
}
