/**
 * Voice profiles: original voice identities shared by speech and singing.
 *
 * A profile is described by separate dimensions (register and singing range,
 * speaking pitch, timbre, vibrato, articulation, expressiveness), never a
 * single pitch number. Profiles are broad artistic archetypes, not copies of
 * any named performer or character.
 *
 * Users can add or adjust profiles with JSON files in .lcai/voices/
 * (or LCAI_VOICES_DIR). A file may "extends" a built-in profile:
 *
 *   { "id": "my-soprano", "name": "My Soprano", "extends": "fairytale-soprano",
 *     "timbre": { "breathiness": 0.5 } }
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { VoiceConfig } from "../voice/voice.js";

export const VOCAL_REGISTERS = [
  "soprano",
  "mezzo-soprano",
  "alto",
  "contralto",
  "tenor",
  "baritone",
  "bass",
] as const;
export type VocalRegister = (typeof VOCAL_REGISTERS)[number];

export interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  qualities: string[];
  register: VocalRegister;
  /** Comfortable singing range, MIDI notes (60 = middle C). */
  singingRange: { low: number; high: number };
  /** Speaking voice, separate from the singing range. */
  speaking: { pitchHz: number; variationSemitones: number; rate: number };
  timbre: {
    /** 0 = dark, 1 = bright. */
    brightness: number;
    /** 0 = clear, 1 = very breathy. */
    breathiness: number;
    warmth: number;
    /** Vocal-tract size: above 1 = smaller, brighter formants. 0.7..1.3 */
    formantShift: number;
  };
  vibrato: { rateHz: number; depthCents: number; onsetSeconds: number };
  articulation: { diction: number; legato: number };
  /** 0 = restrained, 1 = very expressive. */
  expressiveness: number;
}

export const BUILTIN_VOICE_PROFILES: readonly VoiceProfile[] = [
  {
    id: "aurora",
    name: "Aurora",
    description:
      "The default voice: soft, airy and calm, with a gentle shimmer.",
    qualities: ["soft", "airy", "calm", "warm"],
    register: "soprano",
    singingRange: { low: 62, high: 79 },
    speaking: { pitchHz: 215, variationSemitones: 3, rate: 0.92 },
    timbre: {
      brightness: 0.55,
      breathiness: 0.45,
      warmth: 0.6,
      formantShift: 1.06,
    },
    vibrato: { rateHz: 5.3, depthCents: 22, onsetSeconds: 0.35 },
    articulation: { diction: 0.7, legato: 0.85 },
    expressiveness: 0.6,
  },
  {
    id: "fairytale-soprano",
    name: "Fairytale Soprano",
    description: "Light, lyrical, graceful and clear.",
    qualities: ["light", "lyrical", "graceful", "clear"],
    register: "soprano",
    singingRange: { low: 62, high: 81 },
    speaking: { pitchHz: 225, variationSemitones: 4, rate: 1 },
    timbre: {
      brightness: 0.7,
      breathiness: 0.2,
      warmth: 0.5,
      formantShift: 1.08,
    },
    vibrato: { rateHz: 5.6, depthCents: 35, onsetSeconds: 0.25 },
    articulation: { diction: 0.85, legato: 0.8 },
    expressiveness: 0.7,
  },
  {
    id: "classic-storybook",
    name: "Classic Storybook Voice",
    description: "Warm, gentle and elegant.",
    qualities: ["warm", "gentle", "elegant"],
    register: "mezzo-soprano",
    singingRange: { low: 57, high: 74 },
    speaking: { pitchHz: 195, variationSemitones: 3, rate: 0.9 },
    timbre: { brightness: 0.5, breathiness: 0.2, warmth: 0.8, formantShift: 1 },
    vibrato: { rateHz: 5.2, depthCents: 25, onsetSeconds: 0.3 },
    articulation: { diction: 0.8, legato: 0.85 },
    expressiveness: 0.55,
  },
  {
    id: "adventurous-musical",
    name: "Adventurous Musical Voice",
    description: "Bright, animated and expressive.",
    qualities: ["bright", "animated", "expressive"],
    register: "mezzo-soprano",
    singingRange: { low: 57, high: 76 },
    speaking: { pitchHz: 210, variationSemitones: 5, rate: 1.08 },
    timbre: {
      brightness: 0.8,
      breathiness: 0.1,
      warmth: 0.55,
      formantShift: 1.02,
    },
    vibrato: { rateHz: 5.8, depthCents: 30, onsetSeconds: 0.2 },
    articulation: { diction: 0.9, legato: 0.6 },
    expressiveness: 0.9,
  },
  {
    id: "regal",
    name: "Royal / Regal Voice",
    description: "Composed, resonant and confident.",
    qualities: ["composed", "resonant", "confident"],
    register: "alto",
    singingRange: { low: 55, high: 72 },
    speaking: { pitchHz: 185, variationSemitones: 2, rate: 0.88 },
    timbre: {
      brightness: 0.55,
      breathiness: 0.08,
      warmth: 0.7,
      formantShift: 0.98,
    },
    vibrato: { rateHz: 5, depthCents: 30, onsetSeconds: 0.3 },
    articulation: { diction: 0.9, legato: 0.75 },
    expressiveness: 0.45,
  },
  {
    id: "ethereal-elven",
    name: "Ethereal Elven Voice",
    description: "Airy, flowing, delicate and atmospheric.",
    qualities: ["airy", "flowing", "delicate", "atmospheric"],
    register: "soprano",
    singingRange: { low: 64, high: 82 },
    speaking: { pitchHz: 230, variationSemitones: 3, rate: 0.9 },
    timbre: {
      brightness: 0.6,
      breathiness: 0.55,
      warmth: 0.45,
      formantShift: 1.1,
    },
    vibrato: { rateHz: 5.4, depthCents: 18, onsetSeconds: 0.4 },
    articulation: { diction: 0.65, legato: 0.95 },
    expressiveness: 0.55,
  },
  {
    id: "dramatic-stage",
    name: "Dramatic Stage Voice",
    description: "Strong projection and a wide dynamic range.",
    qualities: ["projected", "dramatic", "dynamic"],
    register: "mezzo-soprano",
    singingRange: { low: 55, high: 77 },
    speaking: { pitchHz: 200, variationSemitones: 6, rate: 1 },
    timbre: {
      brightness: 0.75,
      breathiness: 0.06,
      warmth: 0.6,
      formantShift: 1,
    },
    vibrato: { rateHz: 6, depthCents: 45, onsetSeconds: 0.2 },
    articulation: { diction: 0.95, legato: 0.7 },
    expressiveness: 1,
  },
  {
    id: "warm-contralto",
    name: "Warm Contralto",
    description: "Lower register, rich and grounded.",
    qualities: ["rich", "grounded", "warm"],
    register: "contralto",
    singingRange: { low: 50, high: 67 },
    speaking: { pitchHz: 170, variationSemitones: 3, rate: 0.9 },
    timbre: {
      brightness: 0.35,
      breathiness: 0.2,
      warmth: 0.9,
      formantShift: 0.92,
    },
    vibrato: { rateHz: 5, depthCents: 28, onsetSeconds: 0.3 },
    articulation: { diction: 0.8, legato: 0.8 },
    expressiveness: 0.5,
  },
  {
    id: "contemporary-pop",
    name: "Contemporary Pop Voice",
    description: "Direct, rhythmic and modern, with a mostly straight tone.",
    qualities: ["direct", "rhythmic", "modern"],
    register: "mezzo-soprano",
    singingRange: { low: 55, high: 74 },
    speaking: { pitchHz: 205, variationSemitones: 4, rate: 1.05 },
    timbre: {
      brightness: 0.65,
      breathiness: 0.3,
      warmth: 0.6,
      formantShift: 1,
    },
    vibrato: { rateHz: 5.5, depthCents: 12, onsetSeconds: 0.5 },
    articulation: { diction: 0.85, legato: 0.55 },
    expressiveness: 0.7,
  },
  {
    id: "ethereal-elven-princess",
    name: "Ethereal Elven Princess",
    description:
      "Graceful musical-theatre phrasing, clear diction and airy resonance; an original identity.",
    qualities: ["graceful", "clear", "airy", "theatrical"],
    register: "soprano",
    singingRange: { low: 62, high: 80 },
    speaking: { pitchHz: 225, variationSemitones: 4, rate: 0.95 },
    timbre: {
      brightness: 0.65,
      breathiness: 0.4,
      warmth: 0.55,
      formantShift: 1.08,
    },
    vibrato: { rateHz: 5.5, depthCents: 25, onsetSeconds: 0.3 },
    articulation: { diction: 0.9, legato: 0.85 },
    expressiveness: 0.7,
  },
  {
    id: "bright-tenor",
    name: "Bright Tenor",
    description: "Ringing, open and heroic.",
    qualities: ["ringing", "open", "heroic"],
    register: "tenor",
    singingRange: { low: 48, high: 67 },
    speaking: { pitchHz: 130, variationSemitones: 4, rate: 1 },
    timbre: {
      brightness: 0.7,
      breathiness: 0.1,
      warmth: 0.6,
      formantShift: 0.88,
    },
    vibrato: { rateHz: 5.6, depthCents: 32, onsetSeconds: 0.25 },
    articulation: { diction: 0.85, legato: 0.75 },
    expressiveness: 0.75,
  },
  {
    id: "gentle-baritone",
    name: "Gentle Baritone",
    description: "Low, warm and reassuring.",
    qualities: ["low", "warm", "reassuring"],
    register: "baritone",
    singingRange: { low: 43, high: 62 },
    speaking: { pitchHz: 110, variationSemitones: 3, rate: 0.92 },
    timbre: {
      brightness: 0.4,
      breathiness: 0.2,
      warmth: 0.9,
      formantShift: 0.82,
    },
    vibrato: { rateHz: 5, depthCents: 25, onsetSeconds: 0.3 },
    articulation: { diction: 0.8, legato: 0.85 },
    expressiveness: 0.5,
  },
];

/** A blended ensemble voice used for choir parts. */
export const CHOIR_PROFILE: VoiceProfile = {
  id: "ensemble-choir",
  name: "Ensemble Choir",
  description: "A soft blended choir for sustained chords.",
  qualities: ["blended", "soft", "sustained"],
  register: "mezzo-soprano",
  singingRange: { low: 48, high: 79 },
  speaking: { pitchHz: 190, variationSemitones: 2, rate: 1 },
  timbre: { brightness: 0.45, breathiness: 0.35, warmth: 0.7, formantShift: 1 },
  vibrato: { rateHz: 5.2, depthCents: 18, onsetSeconds: 0.2 },
  articulation: { diction: 0.5, legato: 1 },
  expressiveness: 0.4,
};

export const DEFAULT_VOICE_PROFILE_ID = "aurora";
export const BUILTIN_VOICE_PROFILE_IDS = BUILTIN_VOICE_PROFILES.map(
  (p) => p.id,
);

export function findVoiceProfile(
  id: string,
  profiles: readonly VoiceProfile[] = BUILTIN_VOICE_PROFILES,
): VoiceProfile | undefined {
  return profiles.find((p) => p.id === id);
}

function check(ok: boolean, message: string): void {
  if (!ok) throw new Error(message);
}

const unit = (v: unknown) => typeof v === "number" && v >= 0 && v <= 1;
const between = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/** Throw a readable error for the first invalid field. */
export function validateVoiceProfile(
  p: VoiceProfile,
  source = "voice profile",
): VoiceProfile {
  const where = `${source} "${p?.id ?? "?"}"`;
  check(
    typeof p.id === "string" && /^[a-z0-9-]{1,40}$/.test(p.id),
    `${source}: id must be 1-40 chars of a-z, 0-9, -`,
  );
  check(
    typeof p.name === "string" && p.name.trim() !== "",
    `${where}: name is required`,
  );
  check(
    (VOCAL_REGISTERS as readonly string[]).includes(p.register),
    `${where}: register must be one of ${VOCAL_REGISTERS.join(", ")}`,
  );
  const low = p.singingRange?.low;
  const high = p.singingRange?.high;
  check(
    between(low, 24, 96) && between(high, 24, 96) && high! - low! >= 7,
    `${where}: singingRange needs low/high MIDI notes 24..96, at least 7 apart`,
  );
  check(
    between(p.speaking?.pitchHz, 60, 400),
    `${where}: speaking.pitchHz must be 60..400`,
  );
  check(
    between(p.speaking?.variationSemitones, 0, 12),
    `${where}: speaking.variationSemitones must be 0..12`,
  );
  check(
    between(p.speaking?.rate, 0.5, 1.5),
    `${where}: speaking.rate must be 0.5..1.5`,
  );
  check(
    unit(p.timbre?.brightness) &&
      unit(p.timbre?.breathiness) &&
      unit(p.timbre?.warmth),
    `${where}: timbre brightness/breathiness/warmth must be 0..1`,
  );
  check(
    between(p.timbre?.formantShift, 0.7, 1.3),
    `${where}: timbre.formantShift must be 0.7..1.3`,
  );
  check(
    between(p.vibrato?.rateHz, 3, 8) &&
      between(p.vibrato?.depthCents, 0, 100) &&
      between(p.vibrato?.onsetSeconds, 0, 2),
    `${where}: vibrato needs rateHz 3..8, depthCents 0..100, onsetSeconds 0..2`,
  );
  check(
    unit(p.articulation?.diction) && unit(p.articulation?.legato),
    `${where}: articulation diction/legato must be 0..1`,
  );
  check(unit(p.expressiveness), `${where}: expressiveness must be 0..1`);
  return p;
}

type ProfileFile = Partial<VoiceProfile> & { extends?: string };

/** Built-in profiles plus valid user profiles from `dir`. Bad files throw with the file name. */
export function loadVoiceProfiles(
  dir: string = process.env.LCAI_VOICES_DIR ?? ".lcai/voices",
): VoiceProfile[] {
  const profiles: VoiceProfile[] = [...BUILTIN_VOICE_PROFILES];
  if (!existsSync(dir)) return profiles;
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const path = join(dir, file);
    let data: ProfileFile;
    try {
      data = JSON.parse(readFileSync(path, "utf8")) as ProfileFile;
    } catch (err) {
      throw new Error(
        `could not parse ${path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const base = data.extends
      ? findVoiceProfile(data.extends, profiles)
      : undefined;
    if (data.extends && !base)
      throw new Error(`${path}: extends unknown profile "${data.extends}"`);
    const { extends: _ignored, ...own } = data;
    const merged = {
      ...base,
      ...own,
      singingRange: { ...base?.singingRange, ...own.singingRange },
      speaking: { ...base?.speaking, ...own.speaking },
      timbre: { ...base?.timbre, ...own.timbre },
      vibrato: { ...base?.vibrato, ...own.vibrato },
      articulation: { ...base?.articulation, ...own.articulation },
      qualities: own.qualities ?? base?.qualities ?? [],
      description: own.description ?? base?.description ?? "",
    } as VoiceProfile;
    validateVoiceProfile(merged, path);
    const existing = profiles.findIndex((p) => p.id === merged.id);
    if (existing >= 0) profiles[existing] = merged;
    else profiles.push(merged);
  }
  return profiles;
}

/** A natural-language speaking-style prompt (used by OpenAI's instructions field). */
export function speechStyleInstructions(profile: VoiceProfile): string {
  const pace =
    profile.speaking.rate < 0.95
      ? "an unhurried pace"
      : profile.speaking.rate > 1.05
        ? "a lively pace"
        : "a natural pace";
  const breath =
    profile.timbre.breathiness > 0.4 ? ", with a soft, breathy texture" : "";
  const energy =
    profile.expressiveness > 0.75
      ? "very expressive and animated"
      : profile.expressiveness < 0.5
        ? "calm and composed"
        : "warm and expressive";
  return `Speak in a ${profile.qualities.join(", ")} voice${breath}; ${energy}, at ${pace}.`;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const percent = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v)}%`;

/** Adapt text-to-speech settings so speech matches the profile where each provider allows it. */
export function applyVoiceProfile(
  config: VoiceConfig,
  profile: VoiceProfile,
): VoiceConfig {
  const low =
    profile.register === "tenor" ||
    profile.register === "baritone" ||
    profile.register === "bass";
  // Azure's stock voices sit near 210 Hz (higher voices) or 120 Hz (lower voices).
  const azureBase = low ? 120 : 210;
  return {
    ...config,
    elevenlabs: {
      ...config.elevenlabs,
      settings: {
        ...config.elevenlabs.settings,
        stability: clamp(
          0.75 -
            0.5 * profile.expressiveness -
            0.15 * profile.timbre.breathiness,
          0.15,
          0.9,
        ),
        style: clamp(0.15 + 0.5 * profile.expressiveness, 0, 1),
        speed: clamp(profile.speaking.rate, 0.7, 1.2),
      },
    },
    openai: {
      ...config.openai,
      ...(low
        ? { voiceId: profile.register === "tenor" ? "ash" : "onyx" }
        : {}),
      instructions: speechStyleInstructions(profile),
    },
    azure: {
      ...config.azure,
      ...(low ? { voiceId: "en-US-AndrewNeural" } : {}),
      rate: percent(clamp((profile.speaking.rate - 1) * 100, -30, 30)),
      pitch: percent(
        clamp((profile.speaking.pitchHz / azureBase - 1) * 100, -20, 20),
      ),
    },
  };
}
