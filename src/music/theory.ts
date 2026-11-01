/** Music theory helpers: keys, scales, diatonic chords and pitch conversion. */

/** Pitch-class names, using flats for the black keys most songs spell that way. */
export const NOTE_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
} as const;
export type ScaleName = keyof typeof SCALES;
export const SCALE_NAMES = Object.keys(SCALES) as ScaleName[];

export interface Key {
  /** Pitch class of the tonic, 0 = C. */
  tonic: number;
  mode: ScaleName;
}

const LETTERS: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
};
const MODE_WORDS: Record<string, ScaleName> = {
  "": "major",
  major: "major",
  maj: "major",
  m: "minor",
  min: "minor",
  minor: "minor",
  dorian: "dorian",
  mixolydian: "mixolydian",
  lydian: "lydian",
};

/** Parse "D major", "Am", "F# minor", "Bb dorian". */
export function parseKey(text: string): Key {
  const m = /^\s*([a-g])([#b]?)\s*([a-z]*)\s*$/i.exec(text);
  const mode = m ? MODE_WORDS[m[3]!.toLowerCase()] : undefined;
  if (!m || !mode) {
    throw new Error(
      `could not read key "${text}" (try "D major", "A minor" or "F# dorian").`,
    );
  }
  const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return {
    tonic: (LETTERS[m[1]!.toLowerCase()]! + accidental + 12) % 12,
    mode,
  };
}

export function keyName(key: Key): string {
  return `${NOTE_NAMES[key.tonic]} ${key.mode}`;
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function midiToName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * Diatonic scale index to MIDI. Index 0 is the tonic in `octave` (C4 = 60),
 * 7 is the tonic an octave up, -1 the leading note below.
 */
export function degreeToMidi(key: Key, index: number, octave = 4): number {
  const scale = SCALES[key.mode];
  const octaves = Math.floor(index / 7);
  const step = ((index % 7) + 7) % 7;
  return 12 * (octave + 1) + key.tonic + 12 * octaves + scale[step]!;
}

/** Lowest and highest scale indices whose MIDI notes lie within [low, high]. */
export function degreeRange(
  key: Key,
  low: number,
  high: number,
): [number, number] {
  let lo = -40;
  while (degreeToMidi(key, lo) < low) lo++;
  let hi = 60;
  while (degreeToMidi(key, hi) > high) hi--;
  if (hi < lo)
    throw new Error(
      `no notes of ${keyName(key)} fit between ${low} and ${high}`,
    );
  return [lo, hi];
}

export type ChordQuality = "major" | "minor" | "diminished" | "augmented";

export interface Chord {
  /** Scale degree, 1..7. */
  degree: number;
  name: string;
  quality: ChordQuality;
  /** Scale indices of root, third, fifth (and seventh). */
  indices: number[];
  /** Pitch classes in the same order. */
  pitchClasses: number[];
}

const SUFFIX: Record<ChordQuality, string> = {
  major: "",
  minor: "m",
  diminished: "dim",
  augmented: "+",
};

/** The triad (or seventh chord) built on a scale degree of the key. */
export function diatonicChord(
  key: Key,
  degree: number,
  seventh = false,
): Chord {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7) {
    throw new Error(`chord degree must be 1..7 (got ${degree}).`);
  }
  const base = degree - 1;
  const indices = [base, base + 2, base + 4, ...(seventh ? [base + 6] : [])];
  const midis = indices.map((i) => degreeToMidi(key, i, 4));
  const root = midis[0]!;
  const third = midis[1]! - root;
  const fifth = midis[2]! - root;
  const quality: ChordQuality =
    third === 4
      ? fifth === 8
        ? "augmented"
        : "major"
      : fifth === 6
        ? "diminished"
        : "minor";
  const sevenSuffix = seventh ? (midis[3]! - root === 11 ? "maj7" : "7") : "";
  return {
    degree,
    name: `${NOTE_NAMES[root % 12]}${SUFFIX[quality]}${sevenSuffix}`,
    quality,
    indices,
    pitchClasses: midis.map((m) => m % 12),
  };
}
