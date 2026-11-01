/**
 * Composition: song form, chord progressions, a melody fitted to the lyric
 * syllables, harmony vocals, and style-specific accompaniment.
 *
 * Everything is placed in beats on one timeline, so vocals, instruments and
 * MIDI export line up exactly. Output is deterministic for a given seed.
 */
import type { NoteEvent } from "../audio/types.js";
import type { VoiceProfile } from "../profiles/voices.js";
import type { LyricSection } from "./lyrics.js";
import { syllabifyLine, type Syllable } from "./lyrics.js";
import { createRng, pick, type Rng } from "./random.js";
import {
  degreeRange,
  degreeToMidi,
  diatonicChord,
  type Chord,
  type Key,
} from "./theory.js";

// ---------------------------------------------------------------- instruments

export const INSTRUMENT_NAMES = [
  "piano",
  "harp",
  "strings",
  "bass",
  "bells",
  "pad",
  "drums",
  "choir",
] as const;
export type InstrumentName = (typeof INSTRUMENT_NAMES)[number];

export interface InstrumentDef {
  label: string;
  /** General MIDI program for export. */
  program: number;
  gain: number;
  pan: number;
  reverb: number;
}

export const INSTRUMENTS: Record<InstrumentName, InstrumentDef> = {
  piano: { label: "Piano", program: 0, gain: 0.55, pan: -0.1, reverb: 0.25 },
  harp: { label: "Harp", program: 46, gain: 0.42, pan: 0.35, reverb: 0.4 },
  strings: {
    label: "Strings",
    program: 48,
    gain: 0.32,
    pan: -0.35,
    reverb: 0.45,
  },
  bass: { label: "Bass", program: 32, gain: 0.42, pan: 0, reverb: 0.05 },
  bells: { label: "Bells", program: 9, gain: 0.16, pan: 0.4, reverb: 0.5 },
  pad: { label: "Synth pad", program: 89, gain: 0.3, pan: 0.2, reverb: 0.5 },
  drums: { label: "Drums", program: 0, gain: 0.32, pan: 0, reverb: 0.1 },
  choir: { label: "Choir", program: 52, gain: 0.24, pan: -0.2, reverb: 0.55 },
};

// ---------------------------------------------------------------- styles

export const STYLE_NAMES = [
  "fairytale",
  "musical-theatre",
  "classical",
  "celtic",
  "pop",
  "jazz",
  "choral",
  "cinematic",
  "ambient",
] as const;
export type StyleName = (typeof STYLE_NAMES)[number];

export type SectionKind = "intro" | "verse" | "chorus" | "bridge" | "outro";

export interface StyleDef {
  label: string;
  /** Instruments per section. Bridge uses the verse list. */
  instruments: Record<"intro" | "verse" | "chorus" | "outro", InstrumentName[]>;
  piano: "arpeggio" | "block";
  sevenths: boolean;
  swing: boolean;
  /** Default beats per bar. */
  meter: number;
  tempo: [number, number];
  reverb: number;
  defaultVoice: string;
}

export const STYLES: Record<StyleName, StyleDef> = {
  fairytale: {
    label: "Fairytale / storybook orchestral",
    instruments: {
      intro: ["piano", "harp"],
      verse: ["piano", "strings", "bass"],
      chorus: ["piano", "harp", "strings", "bass", "bells"],
      outro: ["piano", "harp", "strings"],
    },
    piano: "arpeggio",
    sevenths: false,
    swing: false,
    meter: 4,
    tempo: [68, 84],
    reverb: 0.4,
    defaultVoice: "fairytale-soprano",
  },
  "musical-theatre": {
    label: "Musical theatre / Broadway",
    instruments: {
      intro: ["piano"],
      verse: ["piano", "bass"],
      chorus: ["piano", "strings", "bass", "drums"],
      outro: ["piano", "strings"],
    },
    piano: "block",
    sevenths: false,
    swing: false,
    meter: 4,
    tempo: [96, 120],
    reverb: 0.3,
    defaultVoice: "adventurous-musical",
  },
  classical: {
    label: "Classical / opera",
    instruments: {
      intro: ["piano"],
      verse: ["piano", "strings"],
      chorus: ["piano", "strings", "bass"],
      outro: ["piano", "strings"],
    },
    piano: "arpeggio",
    sevenths: false,
    swing: false,
    meter: 4,
    tempo: [60, 80],
    reverb: 0.45,
    defaultVoice: "dramatic-stage",
  },
  celtic: {
    label: "Celtic / folk fantasy",
    instruments: {
      intro: ["harp"],
      verse: ["harp", "strings", "bass"],
      chorus: ["harp", "strings", "bass", "drums"],
      outro: ["harp", "strings"],
    },
    piano: "arpeggio",
    sevenths: false,
    swing: false,
    meter: 3,
    tempo: [84, 108],
    reverb: 0.4,
    defaultVoice: "ethereal-elven-princess",
  },
  pop: {
    label: "Pop / rock",
    instruments: {
      intro: ["piano"],
      verse: ["piano", "bass", "drums"],
      chorus: ["piano", "pad", "bass", "drums"],
      outro: ["piano", "pad"],
    },
    piano: "block",
    sevenths: false,
    swing: false,
    meter: 4,
    tempo: [88, 112],
    reverb: 0.25,
    defaultVoice: "contemporary-pop",
  },
  jazz: {
    label: "Jazz",
    instruments: {
      intro: ["piano"],
      verse: ["piano", "bass", "drums"],
      chorus: ["piano", "bass", "drums"],
      outro: ["piano", "bass"],
    },
    piano: "block",
    sevenths: true,
    swing: true,
    meter: 4,
    tempo: [80, 110],
    reverb: 0.25,
    defaultVoice: "warm-contralto",
  },
  choral: {
    label: "Choral / ensemble",
    instruments: {
      intro: ["choir"],
      verse: ["choir", "strings"],
      chorus: ["choir", "strings", "bass", "bells"],
      outro: ["choir", "strings"],
    },
    piano: "arpeggio",
    sevenths: false,
    swing: false,
    meter: 4,
    tempo: [60, 76],
    reverb: 0.55,
    defaultVoice: "fairytale-soprano",
  },
  cinematic: {
    label: "Cinematic soundtrack",
    instruments: {
      intro: ["strings", "pad"],
      verse: ["piano", "strings", "bass"],
      chorus: ["piano", "strings", "bass", "drums", "bells", "choir"],
      outro: ["strings", "pad", "piano"],
    },
    piano: "arpeggio",
    sevenths: false,
    swing: false,
    meter: 4,
    tempo: [70, 92],
    reverb: 0.5,
    defaultVoice: "dramatic-stage",
  },
  ambient: {
    label: "Ambient / electronic",
    instruments: {
      intro: ["pad", "bells"],
      verse: ["pad", "bells", "bass"],
      chorus: ["pad", "bells", "bass", "harp"],
      outro: ["pad", "bells"],
    },
    piano: "arpeggio",
    sevenths: false,
    swing: false,
    meter: 4,
    tempo: [64, 80],
    reverb: 0.6,
    defaultVoice: "ethereal-elven",
  },
};

export function isStyleName(value: unknown): value is StyleName {
  return (
    typeof value === "string" &&
    (STYLE_NAMES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------- song data

export type Mood = "gentle" | "bright" | "sad" | "epic";

export interface SongSection {
  kind: SectionKind;
  startBeats: number;
  bars: number;
  /** Chord name per bar, e.g. ["F", "C", "Dm", "Bb"]. */
  chords: string[];
  /** Scale degree per bar. */
  degrees: number[];
  lines: string[];
  /** Voice profile id of the lead singer (sections with lyrics). */
  singer?: string;
}

export interface SongTrack {
  id: string;
  name: string;
  kind: "vocal" | "instrument";
  /** Instrument for instrument tracks. */
  instrument?: InstrumentName;
  /** Voice profile for vocal tracks. */
  voiceProfileId?: string;
  role?: "lead" | "harmony";
  notes: NoteEvent[];
  gain: number;
  pan: number;
  reverb: number;
}

export interface ComposeSpec {
  key: Key;
  tempo: number;
  beatsPerBar: number;
  style: StyleName;
  lyrics: LyricSection[];
  /** One voice for a solo; two for a duet (second voice takes verse 2 and harmonies). */
  voices: VoiceProfile[];
  seed: number;
}

export interface Arrangement {
  sections: SongSection[];
  tracks: SongTrack[];
  lengthBeats: number;
}

const MAJOR_VERSE = [
  [1, 5, 6, 4],
  [1, 6, 4, 5],
  [1, 4, 6, 5],
  [1, 3, 4, 5],
];
const MAJOR_CHORUS = [
  [4, 1, 5, 6],
  [4, 5, 3, 6],
  [1, 5, 6, 4],
  [4, 5, 1, 1],
];
const MINOR_VERSE = [
  [1, 6, 3, 7],
  [1, 4, 7, 3],
  [1, 7, 6, 7],
  [1, 6, 4, 5],
];
const MINOR_CHORUS = [
  [6, 7, 1, 1],
  [6, 3, 7, 1],
  [4, 6, 7, 1],
  [3, 7, 6, 7],
];

/** Smallest MIDI note at or above `low` with pitch class `pc`. */
const place = (pc: number, low: number) =>
  low + ((((pc - low) % 12) + 12) % 12);

// ---------------------------------------------------------------- melody

interface MelodyContext {
  key: Key;
  bpb: number;
  rng: Rng;
  lo: number;
  hi: number;
  center: number;
}

/** Scale indices of chord tones near `from`, inside the singer's range. */
function nearestChordTone(
  chord: Chord,
  from: number,
  ctx: MelodyContext,
  tonicOnly = false,
): number {
  let best = from;
  let bestScore = Infinity;
  const roots = tonicOnly ? [0] : chord.indices.map((i) => ((i % 7) + 7) % 7);
  for (const r of roots) {
    for (let o = -4; o <= 4; o++) {
      const idx = r + 7 * o;
      if (idx < ctx.lo || idx > ctx.hi) continue;
      const score =
        Math.abs(idx - from) +
        0.35 * Math.abs(idx - ctx.center) +
        ctx.rng() * 0.8;
      if (score < bestScore) {
        best = idx;
        bestScore = score;
      }
    }
  }
  return best;
}

/** Rhythm and pitches for one lyric line spanning two bars. */
function melodyForLine(
  syllables: Syllable[],
  lineStart: number,
  chords: [Chord, Chord],
  ctx: MelodyContext,
  previous: number | undefined,
  ending: "tonic" | "chord",
): { notes: NoteEvent[]; indices: number[]; last: number } {
  const lineBeats = 2 * ctx.bpb;
  const available = lineBeats - 2; // keep the last two beats for a held final note
  const n = syllables.length;

  let unitLen = 1;
  while ((n - 1) * unitLen > available && unitLen > 0.25) unitLen /= 2;
  if ((n - 1) * unitLen > available) unitLen = available / Math.max(1, n - 1);

  const durations = new Array<number>(Math.max(0, n - 1)).fill(unitLen);
  let extra = available - (n - 1) * unitLen;
  for (let guard = 0; extra >= unitLen - 1e-9 && n > 1 && guard < 64; guard++) {
    const candidates = durations
      .map((_, i) => i)
      .filter((i) => syllables[i]!.wordEnd && durations[i]! < unitLen * 3);
    const pool = candidates.length
      ? candidates
      : durations.map((_, i) => i).filter((i) => durations[i]! < unitLen * 3);
    if (!pool.length) break;
    const i = pick(ctx.rng, pool);
    durations[i] = durations[i]! + unitLen;
    extra -= unitLen;
  }
  // Leftover time becomes a short rest before the line (a breath / pickup feel).
  let position = Math.max(0, Math.floor(extra / 0.5) * 0.5);

  const notes: NoteEvent[] = [];
  const indices: number[] = [];
  let idx =
    previous ?? nearestChordTone(chords[0], Math.round(ctx.center), ctx);
  const strongStep = ctx.bpb === 3 ? 3 : 2;

  for (let k = 0; k < n; k++) {
    const isLast = k === n - 1;
    const beat = position;
    const chord = chords[Math.min(1, Math.floor(beat / ctx.bpb))]!;
    const strong =
      Math.abs(beat / strongStep - Math.round(beat / strongStep)) < 1e-6;

    if (isLast) {
      idx = nearestChordTone(chord, idx, ctx, ending === "tonic");
    } else if (k === 0 && previous === undefined) {
      idx = nearestChordTone(chord, idx, ctx);
    } else if (strong) {
      idx = nearestChordTone(chord, idx, ctx);
    } else {
      const dir =
        idx < ctx.center - 1
          ? 1
          : idx > ctx.center + 1
            ? -1
            : ctx.rng() < 0.5
              ? 1
              : -1;
      const r = ctx.rng();
      idx += r < 0.6 ? dir : r < 0.8 ? -dir : r < 0.9 ? 0 : 2 * dir;
    }
    idx = Math.max(ctx.lo, Math.min(ctx.hi, idx));

    const duration = isLast
      ? Math.max(0.5, lineBeats - beat - 0.25)
      : durations[k]!;
    notes.push({
      pitch: degreeToMidi(ctx.key, idx),
      startBeats: lineStart + beat,
      durationBeats: isLast ? duration : duration * 0.95,
      velocity: isLast ? 86 : strong ? 92 : 78,
      lyricSyllable: syllables[k]!.text,
    });
    indices.push(idx);
    position += duration;
  }
  return { notes, indices, last: idx };
}

// ---------------------------------------------------------------- accompaniment

interface BarContext {
  chord: Chord;
  start: number;
  bpb: number;
  style: StyleDef;
  final: boolean;
  /** Next bar's chord root pitch class (for walking bass). */
  nextRoot: number;
}

function swing(style: StyleDef, beat: number): number {
  if (!style.swing) return beat;
  const frac = beat - Math.floor(beat);
  return Math.abs(frac - 0.5) < 1e-6 ? beat + 1 / 6 : beat;
}

function accompanyBar(
  instrument: InstrumentName,
  bar: BarContext,
): NoteEvent[] {
  const { chord, start, bpb, style, final } = bar;
  const [rootPc, thirdPc, fifthPc] = chord.pitchClasses as [
    number,
    number,
    number,
  ];
  const seventhPc = chord.pitchClasses[3];
  const note = (
    pitch: number,
    beat: number,
    duration: number,
    velocity: number,
  ): NoteEvent => ({
    pitch,
    startBeats: start + swing(style, beat),
    durationBeats: duration,
    velocity,
  });
  const R = place(rootPc, 43);
  const up = (pc: number, from: number) => place(pc, from);
  const triadMid = [
    up(rootPc, 55),
    up(thirdPc, 55),
    up(fifthPc, 55),
    ...(seventhPc !== undefined ? [up(seventhPc, 55)] : []),
  ];

  if (final) {
    // Last bar: one long tonic chord from every instrument.
    const hold = bpb * 1.5;
    switch (instrument) {
      case "drums":
        return [note(36, 0, 1, 70), note(49, 0, 2, 55)];
      case "bass":
        return [note(place(rootPc, 36), 0, hold, 80)];
      case "bells":
        return [note(place(thirdPc, 76), 0, hold, 50)];
      case "piano":
      case "harp":
        return [R, R + 7, R + 12, up(thirdPc, R + 12), up(fifthPc, R + 12)].map(
          (p, i) => note(p, i * 0.12, hold, 62),
        );
      default:
        return triadMid.map((p) => note(p, 0, hold, 58));
    }
  }

  switch (instrument) {
    case "piano": {
      if (style.piano === "block") {
        if (bpb === 3) {
          return [
            note(R, 0, 1, 70),
            ...[1, 2].flatMap((b) => triadMid.map((p) => note(p, b, 0.9, 58))),
          ];
        }
        return [
          note(R, 0, 2, 72),
          ...triadMid.map((p) => note(p, 0, 1.5, 62)),
          ...triadMid.map((p) => note(p, 1.5, 0.5, 52)),
          note(R + 7 > 55 ? R - 5 : R + 7, 2, 2, 66),
          ...triadMid.map((p) => note(p, 2, 1.5, 60)),
          ...triadMid.map((p) => note(p, 3.5, 0.5, 50)),
        ];
      }
      const O = R + 12;
      const T = up(thirdPc, O);
      const F = up(fifthPc, R);
      const F2 = up(seventhPc ?? fifthPc, O);
      const pattern =
        bpb === 3 ? [R, F, O, T, O, F] : [R, F, O, T, F2, T, O, F];
      return pattern.map((p, i) => {
        const beat = i * 0.5;
        return note(p, beat, Math.min(2, bpb - beat), i === 0 ? 66 : 54);
      });
    }
    case "harp": {
      const O = R + 12;
      const tones = [
        R,
        up(fifthPc, R),
        O,
        up(thirdPc, O),
        up(fifthPc, O),
        O + 12,
        up(thirdPc, O + 12),
        up(fifthPc, O + 12),
      ];
      const step = bpb === 3 ? 0.5 : 0.25;
      const count = bpb === 3 ? 6 : 8;
      return tones
        .slice(0, count)
        .map((p, i) => note(p, i * step, bpb - i * step, 60 - i * 2));
    }
    case "strings":
      return [up(rootPc, 48), up(thirdPc, 55), up(fifthPc, 60)].map((p) =>
        note(p, 0, bpb, 52),
      );
    case "pad":
      return [
        up(rootPc, 52),
        up(fifthPc, 57),
        up(thirdPc, 62),
        ...(seventhPc !== undefined ? [up(seventhPc, 64)] : []),
      ].map((p) => note(p, 0, bpb, 48));
    case "choir":
      return [up(rootPc, 55), up(thirdPc, 60), up(fifthPc, 64)].map((p) => ({
        ...note(p, 0, bpb, 60),
        lyricSyllable: "ah",
      }));
    case "bass": {
      const B = place(rootPc, 36);
      const fifth = place(fifthPc, B);
      if (style.swing) {
        // Walking bass: root, third, fifth, then a step into the next chord.
        const approach =
          place(bar.nextRoot, 36) + (place(bar.nextRoot, 36) > B ? -1 : 1);
        return [B, place(thirdPc, B), fifth, approach].map((p, i) =>
          note(p, i, 0.9, 74),
        );
      }
      if (bpb === 3) return [note(B, 0, 2.5, 76)];
      return [
        note(B, 0, 1.9, 78),
        note(fifth > B + 7 ? fifth - 12 : fifth, 2, 1.9, 70),
      ];
    }
    case "bells":
      return bpb === 3
        ? [note(place(thirdPc, 76), 0, 2, 48)]
        : [
            note(place(thirdPc, 76), 0, 2, 48),
            note(place(fifthPc, 76), 2, 2, 42),
          ];
    case "drums": {
      const out: NoteEvent[] = [];
      const hatStep = style.swing ? 0.5 : 0.5;
      for (let b = 0; b < bpb; b += hatStep)
        out.push(note(42, b, 0.1, b % 1 === 0 ? 52 : 38));
      if (bpb === 3) {
        out.push(note(36, 0, 0.5, 74), note(38, 2, 0.3, 44));
      } else {
        out.push(
          note(36, 0, 0.5, 78),
          note(36, 2, 0.5, 68),
          note(38, 1, 0.3, 62),
          note(38, 3, 0.3, 62),
        );
      }
      return out;
    }
  }
}

// ---------------------------------------------------------------- compose

/** Build the full arrangement: sections, vocal lines with harmony, and accompaniment. */
export function compose(spec: ComposeSpec): Arrangement {
  if (spec.voices.length === 0)
    throw new Error("compose needs at least one voice");
  if (spec.lyrics.length === 0)
    throw new Error("compose needs at least one lyric section");
  const rng = createRng(spec.seed);
  const style = STYLES[spec.style];
  const bpb = spec.beatsPerBar;
  const minorish = spec.key.mode === "minor" || spec.key.mode === "dorian";
  const verseProg = pick(rng, minorish ? MINOR_VERSE : MAJOR_VERSE);
  const chorusProg = pick(rng, minorish ? MINOR_CHORUS : MAJOR_CHORUS);
  const bridgeProg = minorish ? [4, 6, 7, 5] : [6, 4, 2, 5];

  // ---- form
  const sections: SongSection[] = [];
  let cursor = 0;
  const addSection = (
    kind: SectionKind,
    degrees: number[],
    lines: string[] = [],
    singer?: string,
  ) => {
    sections.push({
      kind,
      startBeats: cursor,
      bars: degrees.length,
      degrees,
      chords: degrees.map(
        (d) => diatonicChord(spec.key, d, style.sevenths).name,
      ),
      lines,
      ...(singer ? { singer } : {}),
    });
    cursor += degrees.length * bpb;
  };

  addSection("intro", [verseProg[0]!, verseProg[1]!]);
  let verseCount = 0;
  spec.lyrics.forEach((lyric, i) => {
    const prog =
      lyric.kind === "chorus"
        ? chorusProg
        : lyric.kind === "bridge"
          ? bridgeProg
          : verseProg;
    const bars = lyric.lines.length * 2;
    const degrees = Array.from(
      { length: bars },
      (_, b) => prog[b % prog.length]!,
    );
    const isLastSection = i === spec.lyrics.length - 1;
    // Verses lean into what follows (V); choruses come home (I).
    degrees[bars - 1] = lyric.kind === "chorus" || isLastSection ? 1 : 5;
    const singer =
      lyric.kind === "verse"
        ? spec.voices[verseCount++ % spec.voices.length]!
        : spec.voices[0]!;
    addSection(lyric.kind, degrees, lyric.lines, singer.id);
  });
  addSection("outro", [4, 1]);
  const lengthBeats = cursor;

  // ---- tracks
  const tracks = new Map<string, SongTrack>();
  const vocalTrack = (
    voice: VoiceProfile,
    role: "lead" | "harmony",
  ): SongTrack => {
    const id = `${role}-${voice.id}`;
    let track = tracks.get(id);
    if (!track) {
      track = {
        id,
        name: `${role === "lead" ? "Lead" : "Harmony"} vocal (${voice.name})`,
        kind: "vocal",
        voiceProfileId: voice.id,
        role,
        notes: [],
        gain: role === "lead" ? 0.75 : 0.32,
        pan: role === "lead" ? 0 : spec.voices.length > 1 ? 0.25 : -0.25,
        reverb: role === "lead" ? 0.3 : 0.45,
      };
      tracks.set(id, track);
    }
    return track;
  };
  const instrumentTrack = (name: InstrumentName): SongTrack => {
    let track = tracks.get(name);
    if (!track) {
      const def = INSTRUMENTS[name];
      track = {
        id: name,
        name: def.label,
        kind: "instrument",
        instrument: name,
        notes: [],
        gain: def.gain,
        pan: def.pan,
        reverb: def.reverb,
      };
      tracks.set(name, track);
    }
    return track;
  };

  // ---- vocals
  const harmonyVoice = spec.voices[1] ?? spec.voices[0]!;
  const previousBySinger = new Map<string, number>();
  for (const section of sections) {
    if (!section.lines.length || !section.singer) continue;
    const voice = spec.voices.find((v) => v.id === section.singer)!;
    const [lo, hi] = degreeRange(
      spec.key,
      voice.singingRange.low,
      voice.singingRange.high,
    );
    const lift =
      section.kind === "chorus" ? 0.62 : section.kind === "bridge" ? 0.7 : 0.42;
    const ctx: MelodyContext = {
      key: spec.key,
      bpb,
      rng,
      lo,
      hi,
      center: lo + (hi - lo) * lift,
    };
    const [hLo, hHi] = degreeRange(
      spec.key,
      harmonyVoice.singingRange.low,
      harmonyVoice.singingRange.high,
    );

    section.lines.forEach((line, i) => {
      const syllables = syllabifyLine(line);
      if (!syllables.length) return;
      const bar = i * 2;
      const chords: [Chord, Chord] = [
        diatonicChord(spec.key, section.degrees[bar]!, style.sevenths),
        diatonicChord(
          spec.key,
          section.degrees[bar + 1] ?? section.degrees[bar]!,
          style.sevenths,
        ),
      ];
      const lastLine = i === section.lines.length - 1;
      const ending =
        lastLine && section.degrees[section.bars - 1] === 1 ? "tonic" : "chord";
      const { notes, indices, last } = melodyForLine(
        syllables,
        section.startBeats + bar * bpb,
        chords,
        ctx,
        previousBySinger.get(voice.id),
        ending,
      );
      previousBySinger.set(voice.id, last);
      vocalTrack(voice, "lead").notes.push(...notes);

      if (section.kind === "chorus") {
        // A diatonic third below the melody (or above, if below is out of range).
        const harmony = vocalTrack(harmonyVoice, "harmony");
        notes.forEach((n, k) => {
          const melodyIdx = indices[k]!;
          const h =
            melodyIdx - 2 >= hLo
              ? melodyIdx - 2
              : melodyIdx + 2 <= hHi
                ? melodyIdx + 2
                : undefined;
          if (h === undefined || h > hHi) return;
          harmony.notes.push({
            ...n,
            pitch: degreeToMidi(spec.key, h),
            velocity: (n.velocity ?? 80) - 14,
          });
        });
      }
    });
  }

  // ---- accompaniment
  sections.forEach((section, si) => {
    const list =
      section.kind === "bridge"
        ? style.instruments.verse
        : style.instruments[
            section.kind as "intro" | "verse" | "chorus" | "outro"
          ];
    for (let b = 0; b < section.bars; b++) {
      const chord = diatonicChord(
        spec.key,
        section.degrees[b]!,
        style.sevenths,
      );
      const nextDegree =
        section.degrees[b + 1] ?? sections[si + 1]?.degrees[0] ?? 1;
      const bar: BarContext = {
        chord,
        start: section.startBeats + b * bpb,
        bpb,
        style,
        final: section.kind === "outro" && b === section.bars - 1,
        nextRoot: diatonicChord(spec.key, nextDegree).pitchClasses[0]!,
      };
      for (const instrument of list)
        instrumentTrack(instrument).notes.push(
          ...accompanyBar(instrument, bar),
        );
    }
  });

  return { sections, tracks: [...tracks.values()], lengthBeats };
}
