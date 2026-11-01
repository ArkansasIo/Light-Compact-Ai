/**
 * Musical mode: turn a prompt (or user lyrics) into a complete original song.
 *
 *   createSong()  prompt -> lyrics, key, tempo, form, melody, harmony, accompaniment
 *   renderSong()  song -> synchronized vocal + instrument audio, mixed to stereo
 *   saveSong()    song.json (re-renderable arrangement), song.mid, mix/vocals/accompaniment WAVs
 *   loadSong()    read a saved song.json back
 *
 * All parts share one Transport, so they line up sample-accurately.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mixTracks, normalize, type MixTrack } from "../audio/mixer.js";
import { Transport } from "../audio/transport.js";
import { encodeWav } from "../audio/wav.js";
import { renderInstrument } from "../instruments/synth.js";
import {
  compose,
  INSTRUMENTS,
  isStyleName,
  STYLE_NAMES,
  STYLES,
  type Mood,
  type SongSection,
  type SongTrack,
  type StyleName,
} from "../music/composer.js";
import {
  generateLyrics,
  parseLyrics,
  type LyricSection,
} from "../music/lyrics.js";
import { writeMidi, type MidiTrackInput } from "../music/midi.js";
import { createRng, hashString, pick } from "../music/random.js";
import {
  keyName,
  parseKey,
  type Key,
  type ScaleName,
} from "../music/theory.js";
import {
  BUILTIN_VOICE_PROFILES,
  CHOIR_PROFILE,
  findVoiceProfile,
  type VoiceProfile,
} from "../profiles/voices.js";
import {
  formantGuideSinger,
  type SingingProvider,
} from "../singing/formant.js";

export const SONG_FORMAT = "light-compact-ai.song";

export interface SongRequest {
  prompt: string;
  style?: string;
  /** e.g. "D major", "A minor". */
  key?: string;
  tempo?: number;
  /** Beats per bar: 3 or 4. */
  meter?: number;
  seed?: number;
  /** Voice profile ids: one for a solo, two for a duet. */
  voices?: string[];
  /** Your own lyrics; sections separated by blank lines, optional [Chorus] headers. */
  lyrics?: string;
  /** "short" = intro, verse, chorus, outro; "full" adds a second verse and chorus. */
  form?: "short" | "full";
}

export interface Song {
  format: typeof SONG_FORMAT;
  version: 1;
  title: string;
  prompt: string;
  style: StyleName;
  mood: Mood;
  key: string;
  tempo: number;
  meter: number;
  seed: number;
  voices: string[];
  lyrics: LyricSection[];
  sections: SongSection[];
  tracks: SongTrack[];
  lengthBeats: number;
  provenance: {
    lyrics: "generated-original" | "user-supplied";
    music: "generated-original";
    instruments: "built-in-synthesis";
    createdAt: string;
  };
}

const STYLE_KEYWORDS: [StyleName, RegExp][] = [
  ["musical-theatre", /\b(broadway|musical|theat(re|er)|show ?tune)\b/],
  ["classical", /\b(opera|operatic|classical|aria)\b/],
  ["celtic", /\b(celtic|folk|irish|scottish|elven|elf|jig|waltz)\b/],
  ["jazz", /\b(jazz|jazzy|swing|blues)\b/],
  ["choral", /\b(choir|choral|hymn|ensemble)\b/],
  ["cinematic", /\b(cinematic|epic|soundtrack|film|movie|orchestral score)\b/],
  ["ambient", /\b(ambient|electronic|synth|chill|atmospheric)\b/],
  ["pop", /\b(pop|rock|upbeat|catchy)\b/],
  [
    "fairytale",
    /\b(fairy ?tale|fairy|storybook|princess|castle|kingdom|once upon)\b/,
  ],
];

const MOOD_KEYWORDS: [Mood, RegExp][] = [
  [
    "sad",
    /\b(sad|melancholy|melancholic|lonely|sorrow|bittersweet|grief|tearful)\b/,
  ],
  ["epic", /\b(epic|heroic|grand|triumphant|battle|mighty)\b/],
  ["bright", /\b(happy|bright|joyful|cheerful|upbeat|playful|fun|dance)\b/],
  ["gentle", /\b(gentle|soft|lullaby|calm|quiet|tender|peaceful|sweet)\b/],
];

export function detectStyle(prompt: string): StyleName {
  const text = prompt.toLowerCase();
  return STYLE_KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? "fairytale";
}

export function detectMood(prompt: string): Mood {
  const text = prompt.toLowerCase();
  return MOOD_KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? "gentle";
}

function modeFor(style: StyleName, mood: Mood): ScaleName {
  if (mood === "sad" || mood === "epic")
    return style === "celtic" ? "dorian" : "minor";
  if (style === "ambient" && mood === "gentle") return "lydian";
  return "major";
}

function tempoFor(style: StyleName, mood: Mood): number {
  const [lo, hi] = STYLES[style].tempo;
  const t =
    mood === "sad"
      ? 0.1
      : mood === "gentle"
        ? 0.3
        : mood === "epic"
          ? 0.65
          : 0.9;
  return Math.round(lo + (hi - lo) * t);
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "song";

/** Compose an original song from a request. Deterministic for the same request and seed. */
export function createSong(
  request: SongRequest,
  profiles: readonly VoiceProfile[] = BUILTIN_VOICE_PROFILES,
): Song {
  const prompt = (request.prompt ?? "").trim();
  if (!prompt)
    throw new Error(
      'describe the song you want, e.g. "a gentle fairytale song"',
    );
  if (prompt.length > 500)
    throw new Error("the prompt is too long (500 characters at most)");
  if (request.lyrics !== undefined && request.lyrics.length > 4000) {
    throw new Error("lyrics are too long (4000 characters at most)");
  }
  if (request.style !== undefined && !isStyleName(request.style)) {
    throw new Error(
      `unknown style "${request.style}". Styles: ${STYLE_NAMES.join(", ")}`,
    );
  }
  if (
    request.tempo !== undefined &&
    !(request.tempo >= 40 && request.tempo <= 200)
  ) {
    throw new Error("tempo must be between 40 and 200 bpm");
  }
  if (
    request.meter !== undefined &&
    request.meter !== 3 &&
    request.meter !== 4
  ) {
    throw new Error("meter must be 3 (waltz time) or 4");
  }

  const seed = request.seed ?? hashString(prompt);
  const rng = createRng(seed);
  const style: StyleName =
    (request.style as StyleName | undefined) ?? detectStyle(prompt);
  const mood = detectMood(prompt);
  const meter = request.meter ?? STYLES[style].meter;
  const tempo = request.tempo ?? tempoFor(style, mood);
  const key: Key = request.key
    ? parseKey(request.key)
    : { tonic: pick(rng, [0, 2, 3, 5, 7, 9, 10]), mode: modeFor(style, mood) };

  const voiceIds = request.voices?.length
    ? request.voices.slice(0, 2)
    : [STYLES[style].defaultVoice];
  const voices = voiceIds.map((id) => {
    const profile = findVoiceProfile(id, profiles);
    if (!profile) {
      throw new Error(
        `unknown voice profile "${id}". Profiles: ${profiles.map((p) => p.id).join(", ")}`,
      );
    }
    return profile;
  });

  const form = request.form ?? (voices.length > 1 ? "full" : "short");
  let title: string;
  let lyrics: LyricSection[];
  if (request.lyrics?.trim()) {
    lyrics = parseLyrics(request.lyrics);
    title = lyrics[0]!.lines[0]!.replace(/[,.;:!?]+$/, "");
  } else {
    const generated = generateLyrics(prompt, rng, form);
    lyrics = generated.sections;
    title = generated.title;
  }

  const arrangement = compose({
    key,
    tempo,
    beatsPerBar: meter,
    style,
    lyrics,
    voices,
    seed: seed + 1,
  });
  return {
    format: SONG_FORMAT,
    version: 1,
    title,
    prompt,
    style,
    mood,
    key: keyName(key),
    tempo,
    meter,
    seed,
    voices: voices.map((v) => v.id),
    lyrics,
    sections: arrangement.sections,
    tracks: arrangement.tracks,
    lengthBeats: arrangement.lengthBeats,
    provenance: {
      lyrics: request.lyrics?.trim() ? "user-supplied" : "generated-original",
      music: "generated-original",
      instruments: "built-in-synthesis",
      createdAt: new Date().toISOString(),
    },
  };
}

export interface RenderedSong {
  sampleRate: number;
  durationSec: number;
  mix: [Float32Array, Float32Array];
  vocals: [Float32Array, Float32Array];
  accompaniment: [Float32Array, Float32Array];
  /** Each track alone (mono, normalized). */
  stems: { id: string; name: string; audio: Float32Array }[];
  singer: string;
}

export interface RenderOptions {
  sampleRate?: number;
  profiles?: readonly VoiceProfile[];
  singer?: SingingProvider;
  /** Called before each track renders. */
  onProgress?: (done: number, total: number, track: string) => void;
  signal?: AbortSignal;
}

/** Render every track on a shared transport and mix them. */
export async function renderSong(
  song: Song,
  options: RenderOptions = {},
): Promise<RenderedSong> {
  const sampleRate = options.sampleRate ?? 44100;
  const profiles = options.profiles ?? BUILTIN_VOICE_PROFILES;
  const singer = options.singer ?? formantGuideSinger;
  const transport = new Transport(song.tempo, sampleRate, {
    beatsPerBar: song.meter,
    beatUnit: 4,
  });
  const total =
    transport.beatsToSamples(song.lengthBeats) + Math.round(3 * sampleRate); // reverb/ring tail
  const signal = options.signal ? { signal: options.signal } : {};

  const stems: RenderedSong["stems"] = [];
  const vocalMix: MixTrack[] = [];
  const backingMix: MixTrack[] = [];

  for (const [i, track] of song.tracks.entries()) {
    options.signal?.throwIfAborted();
    options.onProgress?.(i, song.tracks.length, track.name);
    let audio: Float32Array;
    if (track.kind === "vocal") {
      const profile = findVoiceProfile(track.voiceProfileId ?? "", profiles);
      if (!profile)
        throw new Error(
          `track "${track.name}" uses unknown voice profile "${track.voiceProfileId}"`,
        );
      audio = await singer.render(track.notes, profile, transport, total, {
        seed: song.seed + i,
        ensemble: track.role === "harmony" ? 2 : 1,
        ...signal,
      });
    } else if (track.instrument === "choir") {
      audio = await singer.render(
        track.notes,
        CHOIR_PROFILE,
        transport,
        total,
        { seed: song.seed + i, ensemble: 3, ...signal },
      );
    } else if (track.instrument) {
      audio = renderInstrument(
        track.instrument,
        track.notes,
        transport,
        total,
        song.seed + i,
      );
    } else {
      continue;
    }
    normalize(audio, 0.9);
    stems.push({ id: track.id, name: track.name, audio });
    const mixTrack: MixTrack = {
      name: track.name,
      audio,
      gain: track.gain,
      pan: track.pan,
      reverb: track.reverb,
    };
    (track.kind === "vocal" ? vocalMix : backingMix).push(mixTrack);
  }
  options.onProgress?.(song.tracks.length, song.tracks.length, "mix");

  const reverbLevel = STYLES[song.style].reverb;
  return {
    sampleRate,
    durationSec: total / sampleRate,
    mix: mixTracks([...vocalMix, ...backingMix], sampleRate, { reverbLevel }),
    vocals: mixTracks(vocalMix, sampleRate, { reverbLevel }),
    accompaniment: mixTracks(backingMix, sampleRate, { reverbLevel }),
    stems,
    singer: singer.label,
  };
}

/** MIDI tracks for export: one channel per track, drums on channel 10. */
export function songToMidi(song: Song): Buffer {
  let channel = 0;
  const tracks: MidiTrackInput[] = song.tracks.map((track) => {
    const drums = track.instrument === "drums";
    if (!drums && channel === 9) channel++;
    const ch = drums ? 9 : channel++ % 16;
    return {
      name: track.name,
      program:
        track.kind === "vocal"
          ? 53
          : INSTRUMENTS[track.instrument ?? "piano"].program,
      channel: ch,
      notes: track.notes,
      lyrics: track.kind === "vocal" && track.role === "lead",
    };
  });
  return writeMidi(tracks, {
    tempo: song.tempo,
    beatsPerBar: song.meter,
    title: song.title,
  });
}

export interface SavedSong {
  dir: string;
  json: string;
  midi: string;
  mix: string;
  vocals: string;
  accompaniment: string;
  stems: string[];
}

export function defaultSongDir(song: Song): string {
  return join(
    process.env.LCAI_SONGS_DIR ?? "songs",
    `${slug(song.title)}-${song.seed}`,
  );
}

/** Save the arrangement, MIDI and audio. Returns the file paths. */
export function saveSong(
  song: Song,
  rendered: RenderedSong,
  dir: string = defaultSongDir(song),
  options: { stems?: boolean } = {},
): SavedSong {
  mkdirSync(dir, { recursive: true });
  const paths: SavedSong = {
    dir,
    json: join(dir, "song.json"),
    midi: join(dir, "song.mid"),
    mix: join(dir, "mix.wav"),
    vocals: join(dir, "vocals.wav"),
    accompaniment: join(dir, "accompaniment.wav"),
    stems: [],
  };
  writeFileSync(paths.json, JSON.stringify(song, null, 2) + "\n");
  writeFileSync(paths.midi, songToMidi(song));
  writeFileSync(paths.mix, encodeWav(rendered.mix, rendered.sampleRate));
  writeFileSync(paths.vocals, encodeWav(rendered.vocals, rendered.sampleRate));
  writeFileSync(
    paths.accompaniment,
    encodeWav(rendered.accompaniment, rendered.sampleRate),
  );
  if (options.stems) {
    mkdirSync(join(dir, "stems"), { recursive: true });
    for (const stem of rendered.stems) {
      const path = join(dir, "stems", `${stem.id}.wav`);
      writeFileSync(path, encodeWav([stem.audio], rendered.sampleRate));
      paths.stems.push(path);
    }
  }
  return paths;
}

export function loadSong(path: string): Song {
  let data: Song;
  try {
    data = JSON.parse(readFileSync(path, "utf8")) as Song;
  } catch (err) {
    throw new Error(
      `could not read ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (
    data?.format !== SONG_FORMAT ||
    data.version !== 1 ||
    !Array.isArray(data.tracks)
  ) {
    throw new Error(`${path} is not a Light Compact AI song file`);
  }
  return data;
}

/** Short human-readable description lines. */
export function describeSong(
  song: Song,
  profiles: readonly VoiceProfile[] = BUILTIN_VOICE_PROFILES,
): string[] {
  const seconds = Math.round((song.lengthBeats * 60) / song.tempo);
  const voices = song.voices
    .map((id) => findVoiceProfile(id, profiles)?.name ?? id)
    .join(" & ");
  const instruments = song.tracks
    .filter((t) => t.kind === "instrument")
    .map((t) => t.name.toLowerCase());
  return [
    `${STYLES[song.style].label} · ${song.key} · ${song.tempo} bpm · ${song.meter}/4 · ~${seconds}s`,
    `Voice: ${voices} · Instruments: ${instruments.join(", ")}`,
    `Form: ${song.sections.map((s) => s.kind).join(" → ")}`,
  ];
}
