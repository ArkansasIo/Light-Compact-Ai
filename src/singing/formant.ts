/**
 * Singing providers.
 *
 * Singing is not TTS at a higher pitch: it needs note timing, sustained
 * vowels, transitions and expression. A SingingProvider receives note events
 * that already carry their syllables (phoneme-to-note alignment happens in
 * the composer) plus a voice profile, and returns audio on the song's
 * transport timeline.
 *
 * The built-in "formant-guide" provider is a source-filter synthesizer: a
 * band-limited glottal source with vibrato, breath noise and pitch glides,
 * shaped by three vowel formant filters. It sings the right notes, vowels
 * and timing, but it is a GUIDE VOCAL: recognizably synthetic, with only
 * rough consonants. Connect a licensed singing-synthesis backend through this
 * interface for natural vocals.
 */
import type { NoteEvent } from "../audio/types.js";
import type { Transport } from "../audio/transport.js";
import { vowelOf, type Vowel } from "../music/lyrics.js";
import { createRng } from "../music/random.js";
import { midiToFrequency } from "../music/theory.js";
import type { VoiceProfile } from "../profiles/voices.js";

export interface SingingRenderOptions {
  seed?: number;
  /** Number of slightly detuned, offset copies (choir / doubled vocals). */
  ensemble?: number;
  signal?: AbortSignal;
}

export interface SingingProvider {
  readonly id: string;
  readonly label: string;
  /** False for guide/placeholder vocals. */
  readonly natural: boolean;
  render(
    notes: NoteEvent[],
    profile: VoiceProfile,
    transport: Transport,
    totalSamples: number,
    options?: SingingRenderOptions,
  ): Promise<Float32Array>;
}

const TAU = Math.PI * 2;

/** Formant frequencies (Hz) for a higher voice; scaled by the profile's formantShift. */
const FORMANTS: Record<Vowel, [number, number, number]> = {
  a: [800, 1150, 2900],
  e: [420, 1900, 2700],
  i: [300, 2300, 3000],
  o: [450, 800, 2830],
  u: [325, 700, 2530],
};
const FORMANT_GAINS = [1, 0.55, 0.22];
const FORMANT_BANDWIDTHS = [90, 110, 160];
const UNVOICED = /^(s|sh|f|h|th|t|k|p|c|ch|x)/;

/** RBJ band-pass (0 dB peak) biquad with mutable coefficients. */
class Resonator {
  private b0 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  set(freq: number, bandwidth: number, sr: number): void {
    const f = Math.min(freq, sr * 0.45);
    const w0 = (TAU * f) / sr;
    const alpha = Math.sin(w0) / (2 * (f / bandwidth));
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w0)) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y =
      this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

function renderGuide(
  notes: NoteEvent[],
  profile: VoiceProfile,
  transport: Transport,
  totalSamples: number,
  options: SingingRenderOptions,
): Float32Array {
  const sr = transport.sampleRate;
  const out = new Float32Array(totalSamples);
  const rng = createRng(options.seed ?? 1);
  const copies = Math.max(1, Math.min(6, options.ensemble ?? 1));
  const sorted = [...notes].sort((a, b) => a.startBeats - b.startBeats);
  const { brightness, breathiness, formantShift } = profile.timbre;
  const tilt = 2.3 - 1.2 * brightness; // flatter spectrum = brighter
  const glideSamples = Math.round(0.07 * sr);
  const release = Math.round((0.06 + 0.06 * profile.articulation.legato) * sr);

  for (let copy = 0; copy < copies; copy++) {
    const detune = copies > 1 ? (rng() * 2 - 1) * 10 : 0;
    const offset = copies > 1 ? Math.round((rng() * 2 - 1) * 0.015 * sr) : 0;
    const vibPhase = rng() * TAU;
    const gain = 1 / Math.sqrt(copies);
    let prev: { end: number; freq: number; vowel: Vowel } | undefined;

    for (const note of sorted) {
      options.signal?.throwIfAborted();
      const start = transport.beatsToSamples(note.startBeats) + offset;
      if (start >= totalSamples || start < 0) continue;
      const holdEnd =
        transport.beatsToSamples(note.startBeats + note.durationBeats) + offset;
      const end = Math.min(totalSamples, holdEnd + release);
      const f0 = midiToFrequency(note.pitch) * 2 ** (detune / 1200);
      const syllable = note.lyricSyllable ?? "ah";
      const vowel = vowelOf(syllable);
      const onset = /^[^aeiouy]*/.exec(syllable.toLowerCase())?.[0] ?? "";
      const legato =
        prev !== undefined && Math.abs(prev.end - start) < 0.08 * sr;
      const fromFreq = legato ? prev!.freq : f0;
      const fromVowel = legato ? prev!.vowel : vowel;
      const unvoiced = UNVOICED.test(onset);
      const attack = Math.round((onset && !unvoiced ? 0.07 : 0.035) * sr);
      const vel = Math.max(0.1, (note.velocity ?? 80) / 127);
      const harmonics = Math.max(1, Math.min(40, Math.floor(6000 / f0)));
      const amps = Array.from(
        { length: harmonics },
        (_, k) => 1 / (k + 1) ** tilt,
      );
      const ampSum = amps.reduce((a, b) => a + b, 0);
      const filters = [new Resonator(), new Resonator(), new Resonator()];
      let phase = 0;
      const drift = (rng() * 2 - 1) * 4; // a few cents of natural pitch offset

      for (let i = start; i < end; i++) {
        const n = i - start;
        const t = n / sr;

        if (n % 32 === 0) {
          // Formants glide between vowels; F1 rises to follow high notes (as sopranos do).
          const mix = Math.min(1, n / (0.06 * sr));
          const a = FORMANTS[fromVowel];
          const b = FORMANTS[vowel];
          for (let j = 0; j < 3; j++) {
            let f = (a[j]! + (b[j]! - a[j]!) * mix) * formantShift;
            if (j === 0 && f0 * 1.1 > f) f = f0 * 1.1;
            filters[j]!.set(
              f,
              FORMANT_BANDWIDTHS[j]! * (1 + breathiness * 0.5),
              sr,
            );
          }
        }

        let f = f0;
        if (legato && n < glideSamples)
          f = fromFreq * (f0 / fromFreq) ** (n / glideSamples);
        const vibAmount =
          t > profile.vibrato.onsetSeconds
            ? Math.min(1, (t - profile.vibrato.onsetSeconds) / 0.3)
            : 0;
        f *=
          2 **
          ((profile.vibrato.depthCents *
            vibAmount *
            Math.sin(TAU * profile.vibrato.rateHz * t + vibPhase) +
            drift) /
            1200);
        phase += f / sr;
        if (phase >= 1) phase -= 1;

        let source = 0;
        for (let k = 0; k < harmonics; k++)
          source += amps[k]! * Math.sin(TAU * (k + 1) * phase);
        source /= ampSum;
        const noise = rng() * 2 - 1;
        source += noise * breathiness * 0.35;

        let y = source * 0.04;
        for (let j = 0; j < 3; j++)
          y += filters[j]!.process(source) * FORMANT_GAINS[j]!;

        let env = n < attack ? n / attack : 1;
        if (i > holdEnd) env *= Math.max(0, 1 - (i - holdEnd) / release);
        // Unvoiced consonant: a short noise burst at the start of the syllable.
        if (unvoiced && t < 0.04) y += noise * 0.12 * (1 - t / 0.04);
        out[i] = out[i]! + y * env * vel * gain;
      }
      prev = { end: holdEnd, freq: f0, vowel };
    }
  }
  return out;
}

export const formantGuideSinger: SingingProvider = {
  id: "formant-guide",
  label: "Formant guide vocal (built in, synthetic)",
  natural: false,
  async render(notes, profile, transport, totalSamples, options = {}) {
    return renderGuide(notes, profile, transport, totalSamples, options);
  },
};

export const SINGING_PROVIDERS: Record<string, SingingProvider> = {
  [formantGuideSinger.id]: formantGuideSinger,
};
