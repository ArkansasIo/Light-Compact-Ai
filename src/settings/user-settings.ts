/**
 * User settings for chatting with the compact AI: how replies are generated
 * and how the terminal UI looks. Saved to .lcai/settings.json (or LCAI_SETTINGS).
 *
 * Every setting is described in SETTING_DEFS, which drives validation, the
 * /settings panel in the chat UI, and the options accepted by the HTTP API.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SamplingOptions } from "../engine/sampling.js";
import { VOICE_PROVIDERS, type VoiceProviderName } from "../voice/voice.js";
import {
  BUILTIN_VOICE_PROFILE_IDS,
  DEFAULT_VOICE_PROFILE_ID,
} from "../profiles/voices.js";

export const THEMES = ["teal", "orange", "blue", "purple", "mono"] as const;
export type Theme = (typeof THEMES)[number];

export interface UserSettings {
  /** 0 = always pick the most likely word; higher = more random. */
  temperature: number;
  /** Only sample from the k most likely words (0 = no limit). */
  topK: number;
  /** Only sample from the smallest set of words whose probability adds up to p. */
  topP: number;
  /** Values above 1 discourage repeating recent words. */
  repetitionPenalty: number;
  /** Maximum words per reply. */
  maxTokens: number;
  /** Delay between streamed words in the chat UI (0 = instant). */
  streamDelayMs: number;
  /** Show the token count and timing line under replies. */
  showStats: boolean;
  /** Accent color of the chat UI. */
  theme: Theme;
  /** Speak replies aloud in the chat UI. */
  voice: boolean;
  /** Text-to-speech service tried first (the other one is the fallback). */
  voiceProvider: VoiceProviderName;
  /** Voice identity for speech and singing (src/profiles/voices.ts). */
  voiceProfile: string;
}

export type SettingKey = keyof UserSettings;

interface NumberDef {
  kind: "number";
  key: SettingKey;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  /** How to show the value, e.g. "off" for 0. */
  format?: (value: number) => string;
}
interface BooleanDef {
  kind: "boolean";
  key: SettingKey;
  label: string;
  description: string;
}
interface ChoiceDef {
  kind: "choice";
  key: SettingKey;
  label: string;
  description: string;
  choices: readonly string[];
}
export type SettingDef = NumberDef | BooleanDef | ChoiceDef;

export const DEFAULT_SETTINGS: UserSettings = {
  temperature: 0,
  topK: 0,
  topP: 1,
  repetitionPenalty: 1,
  maxTokens: 24,
  streamDelayMs: 30,
  showStats: true,
  theme: "teal",
  voice: false,
  voiceProvider: "elevenlabs",
  voiceProfile: DEFAULT_VOICE_PROFILE_ID,
};

export const SETTING_DEFS: SettingDef[] = [
  {
    kind: "number",
    key: "temperature",
    label: "Temperature",
    description:
      "0 always picks the most likely word. Higher values give more varied, random replies.",
    min: 0,
    max: 2,
    step: 0.1,
    format: (v) => (v === 0 ? "0 (precise)" : v.toFixed(1)),
  },
  {
    kind: "number",
    key: "topK",
    label: "Top-k",
    description:
      "Only choose among the k most likely words. 0 means no limit. Needs temperature > 0.",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => (v === 0 ? "off" : String(v)),
  },
  {
    kind: "number",
    key: "topP",
    label: "Top-p",
    description:
      "Only choose among the most likely words that together reach this probability. Needs temperature > 0.",
    min: 0.05,
    max: 1,
    step: 0.05,
    format: (v) => (v >= 1 ? "1.00 (off)" : v.toFixed(2)),
  },
  {
    kind: "number",
    key: "repetitionPenalty",
    label: "Repetition penalty",
    description:
      "Above 1 makes recently used words less likely. Needs temperature > 0.",
    min: 1,
    max: 2,
    step: 0.05,
    format: (v) => (v === 1 ? "1.00 (off)" : v.toFixed(2)),
  },
  {
    kind: "number",
    key: "maxTokens",
    label: "Max reply length",
    description: "The most words a reply can contain.",
    min: 1,
    max: 256,
    step: 4,
    format: (v) => `${v} tokens`,
  },
  {
    kind: "number",
    key: "streamDelayMs",
    label: "Streaming speed",
    description:
      "Pause between streamed words in the chat UI. 0 shows replies instantly.",
    min: 0,
    max: 200,
    step: 10,
    format: (v) => (v === 0 ? "instant" : `${v} ms/word`),
  },
  {
    kind: "boolean",
    key: "showStats",
    label: "Show reply stats",
    description: "Show the token count and time under each reply.",
  },
  {
    kind: "choice",
    key: "theme",
    label: "Theme",
    description: "Accent color of the chat UI.",
    choices: THEMES,
  },
  {
    kind: "boolean",
    key: "voice",
    label: "Speak replies",
    description:
      "Read replies aloud with the Aurora voice. Needs an ElevenLabs, OpenAI or Azure Speech key in .env.",
  },
  {
    kind: "choice",
    key: "voiceProvider",
    label: "Voice provider",
    description:
      "Text-to-speech service tried first. If it fails, the other one is used.",
    choices: VOICE_PROVIDERS,
  },
  {
    kind: "choice",
    key: "voiceProfile",
    label: "Voice profile",
    description:
      "Voice identity used for speaking and for /sing (fairytale soprano, warm contralto, ...).",
    choices: BUILTIN_VOICE_PROFILE_IDS,
  },
];

export const DEFAULT_SETTINGS_PATH = ".lcai/settings.json";

/** Round to the step's precision to avoid values like 0.30000000000000004. */
function roundToStep(value: number, step: number): number {
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number(value.toFixed(decimals));
}

/** Check one value against its definition; returns a valid value or undefined. */
function coerce(
  def: SettingDef,
  value: unknown,
): UserSettings[SettingKey] | undefined {
  switch (def.kind) {
    case "number": {
      const n =
        typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : value;
      if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
      return roundToStep(Math.min(def.max, Math.max(def.min, n)), def.step);
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === "on") return true;
      if (value === "false" || value === "off") return false;
      return undefined;
    case "choice":
      return typeof value === "string" && def.choices.includes(value)
        ? (value as UserSettings[SettingKey])
        : undefined;
  }
}

/**
 * Build a full, valid settings object from untrusted input (a file, an HTTP
 * body). Unknown keys are ignored; invalid values fall back to `base`, and
 * numbers are clamped to their allowed range.
 */
export function normalizeSettings(
  input: unknown,
  base: UserSettings = DEFAULT_SETTINGS,
): UserSettings {
  const result: UserSettings = { ...base };
  if (typeof input !== "object" || input === null) return result;
  const record = input as Record<string, unknown>;
  for (const def of SETTING_DEFS) {
    if (!(def.key in record)) continue;
    const value = coerce(def, record[def.key]);
    if (value !== undefined)
      (result as unknown as Record<string, unknown>)[def.key] = value;
  }
  return result;
}

/** Return settings with one value stepped up (+1) or down (-1). Choices and booleans wrap around. */
export function adjustSetting(
  settings: UserSettings,
  key: SettingKey,
  direction: 1 | -1,
): UserSettings {
  const def = SETTING_DEFS.find((d) => d.key === key);
  if (!def) return settings;
  const current = settings[key];
  let next: unknown;
  switch (def.kind) {
    case "number":
      next = (current as number) + direction * def.step;
      break;
    case "boolean":
      next = !current;
      break;
    case "choice": {
      const i = def.choices.indexOf(current as string);
      next =
        def.choices[(i + direction + def.choices.length) % def.choices.length];
      break;
    }
  }
  return normalizeSettings({ [key]: next }, settings);
}

/** Human-readable value for the settings panel. */
export function formatSetting(settings: UserSettings, def: SettingDef): string {
  const value = settings[def.key];
  if (def.kind === "number")
    return def.format ? def.format(value as number) : String(value);
  if (def.kind === "boolean") return value ? "on" : "off";
  return String(value);
}

/** Convert settings to options for sampleLogits; undefined means greedy decoding. */
export function toSamplingOptions(
  settings: UserSettings,
): SamplingOptions | undefined {
  if (settings.temperature === 0) return undefined;
  return {
    temperature: settings.temperature,
    ...(settings.topK > 0 ? { topK: settings.topK } : {}),
    topP: settings.topP,
    repetitionPenalty: settings.repetitionPenalty,
  };
}

/** Load settings from disk. A missing file gives `defaults`; a broken file throws. */
export function loadSettings(
  path: string = DEFAULT_SETTINGS_PATH,
  defaults: UserSettings = DEFAULT_SETTINGS,
): UserSettings {
  if (!existsSync(path)) return { ...defaults };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(
      `could not parse ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return normalizeSettings(parsed, defaults);
}

export function saveSettings(
  settings: UserSettings,
  path: string = DEFAULT_SETTINGS_PATH,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
}
