/**
 * Text-to-speech for the compact AI, using ElevenLabs, OpenAI, Azure Speech or
 * Play.ht. With fallback on, providers are tried in VOICE_PROVIDERS order after
 * the chosen one; providers without keys are skipped.
 *
 * The "aurora" preset is a soft, airy, calm voice built from each provider's
 * stock voice library and tuned with expressive settings. It is a style, not
 * a copy of any real person's voice; set ELEVENLABS_VOICE_ID, OPENAI_TTS_VOICE,
 * AZURE_SPEECH_VOICE or PLAYHT_VOICE_ID to use a different voice.
 *
 * Settings are resolved in this order, later ones winning:
 *   1. The preset (VOICE_PRESETS)
 *   2. The "voice" section of compact.config.json (or the LCAI_CONFIG path)
 *   3. Environment variables (see .env.example)
 *
 * API keys are only read from the environment, never from config files.
 */
import { existsSync, readFileSync } from "node:fs";
import { DEFAULT_CONFIG_PATH } from "../config/compact-config.js";

/** Fallback order. Play.ht is last: its API host stopped resolving in 2025. */
export const VOICE_PROVIDERS = [
  "elevenlabs",
  "openai",
  "azure",
  "playht",
] as const;
export type VoiceProviderName = (typeof VOICE_PROVIDERS)[number];

export interface ElevenLabsVoiceSettings {
  /** Lower = more expressive and varied, higher = steadier. 0..1 */
  stability: number;
  /** How closely to stick to the original voice. 0..1 */
  similarity_boost: number;
  /** Style exaggeration. 0..1 */
  style: number;
  use_speaker_boost: boolean;
  /** Speaking rate. 0.7..1.2 */
  speed: number;
}

export interface VoiceConfig {
  /** Provider tried first. */
  provider: VoiceProviderName;
  /** Try the other provider if the first one fails or has no key. */
  fallback: boolean;
  preset: string;
  /** Longer text is cut at a sentence or word boundary. */
  maxChars: number;
  /** Seconds before a provider request is abandoned. */
  timeoutSeconds: number;
  elevenlabs: {
    apiKey?: string;
    voiceId: string;
    modelId: string;
    outputFormat: string;
    settings: ElevenLabsVoiceSettings;
  };
  openai: {
    apiKey?: string;
    model: string;
    /** One of OpenAI's stock voices (alloy, coral, nova, sage, shimmer, ...). */
    voiceId: string;
    /** Speaking-style prompt (gpt-4o-mini-tts and newer models). */
    instructions: string;
  };
  azure: {
    apiKey?: string;
    /** Azure resource region, e.g. "eastus". */
    region?: string;
    /** A neural voice name, e.g. "en-US-AvaNeural". */
    voiceId: string;
    /** SSML prosody, e.g. "-8%". */
    rate: string;
    pitch: string;
  };
  playht: {
    apiKey?: string;
    userId?: string;
    /** A Play.ht voice manifest URL (s3://...manifest.json). */
    voiceId: string;
    voiceEngine: string;
    speed: number;
    temperature: number;
  };
}

type PresetConfig = Omit<
  VoiceConfig,
  "elevenlabs" | "openai" | "azure" | "playht"
> & {
  elevenlabs: Omit<VoiceConfig["elevenlabs"], "apiKey">;
  openai: Omit<VoiceConfig["openai"], "apiKey">;
  azure: Omit<VoiceConfig["azure"], "apiKey" | "region">;
  playht: Omit<VoiceConfig["playht"], "apiKey" | "userId">;
};

export const VOICE_PRESETS: Record<string, PresetConfig> = {
  /** Soft, airy and calm: low stability for a dreamy, breathy delivery, slightly slow. */
  aurora: {
    provider: "elevenlabs",
    fallback: true,
    preset: "aurora",
    maxChars: 1000,
    timeoutSeconds: 30,
    elevenlabs: {
      voiceId: "pFZP5JQG7iQjIQuC4Bku", // stock "Lily": soft, warm female voice
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128",
      settings: {
        stability: 0.35,
        similarity_boost: 0.8,
        style: 0.4,
        use_speaker_boost: true,
        speed: 0.92,
      },
    },
    openai: {
      model: "gpt-4o-mini-tts",
      voiceId: "shimmer", // stock: light, clear female voice
      instructions:
        "Speak softly and calmly, with a light, airy, dreamy tone, warm and gentle, at an unhurried pace.",
    },
    azure: {
      voiceId: "en-US-AvaNeural", // stock: warm, soft female neural voice
      rate: "-8%",
      pitch: "+2%",
    },
    playht: {
      // stock "Jennifer" voice from the Play.ht voice library
      voiceId:
        "s3://voice-cloning-zero-shot/775ae416-49bb-4fb6-bd45-740f205d20a1/jennifersaad/manifest.json",
      voiceEngine: "Play3.0-mini",
      speed: 0.9,
      temperature: 0.7,
    },
  },
};

export const DEFAULT_VOICE_PRESET = "aurora";

/** The "voice" section of compact.config.json; every field optional. */
export interface VoiceFileConfig {
  provider?: string;
  fallback?: boolean;
  preset?: string;
  maxChars?: number;
  timeoutSeconds?: number;
  elevenlabs?: Partial<
    Omit<VoiceConfig["elevenlabs"], "apiKey" | "settings">
  > & {
    settings?: Partial<ElevenLabsVoiceSettings>;
  };
  openai?: Partial<Omit<VoiceConfig["openai"], "apiKey">>;
  azure?: Partial<Omit<VoiceConfig["azure"], "apiKey">>;
  playht?: Partial<Omit<VoiceConfig["playht"], "apiKey" | "userId">>;
}

export function isVoiceProvider(value: unknown): value is VoiceProviderName {
  return (
    typeof value === "string" &&
    (VOICE_PROVIDERS as readonly string[]).includes(value)
  );
}

const nonEmpty = (value: string | undefined): string | undefined =>
  value && value.trim() ? value.trim() : undefined;

function readFileSection(env: NodeJS.ProcessEnv): VoiceFileConfig {
  const path = env.LCAI_CONFIG ?? DEFAULT_CONFIG_PATH;
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      voice?: VoiceFileConfig;
    };
    return parsed.voice ?? {};
  } catch {
    // compact-config.ts reports parse errors; voice just uses defaults.
    return {};
  }
}

/** Build the voice config from preset + config file + environment, then validate. */
export function loadVoiceConfig(
  env: NodeJS.ProcessEnv = process.env,
  file: VoiceFileConfig = readFileSection(env),
): VoiceConfig {
  const presetName =
    nonEmpty(env.LCAI_VOICE_PRESET) ?? file.preset ?? DEFAULT_VOICE_PRESET;
  const preset = VOICE_PRESETS[presetName];
  if (!preset) {
    throw new Error(
      `unknown voice preset "${presetName}". Presets: ${Object.keys(VOICE_PRESETS).join(", ")}`,
    );
  }

  const provider =
    nonEmpty(env.LCAI_VOICE_PROVIDER) ?? file.provider ?? preset.provider;
  if (!isVoiceProvider(provider)) {
    throw new Error(
      `voice provider must be one of ${VOICE_PROVIDERS.join(", ")} (got "${provider}").`,
    );
  }

  const elevenKey = nonEmpty(env.ELEVENLABS_API_KEY);
  const playKey = nonEmpty(env.PLAYHT_API_KEY);
  const playUser = nonEmpty(env.PLAYHT_USER_ID);
  const openaiKey = nonEmpty(env.OPENAI_API_KEY);
  const azureKey = nonEmpty(env.AZURE_SPEECH_KEY);
  /** { [field]: value } when the env var is set, else {}. */
  const fromEnv = <K extends string>(field: K, name: string) => {
    const value = nonEmpty(env[name]);
    return (value ? { [field]: value } : {}) as Partial<Record<K, string>>;
  };

  const config: VoiceConfig = {
    provider,
    fallback:
      env.LCAI_VOICE_FALLBACK !== undefined && env.LCAI_VOICE_FALLBACK !== ""
        ? !/^(0|false|off|no)$/i.test(env.LCAI_VOICE_FALLBACK)
        : (file.fallback ?? preset.fallback),
    preset: presetName,
    maxChars: file.maxChars ?? preset.maxChars,
    timeoutSeconds: file.timeoutSeconds ?? preset.timeoutSeconds,
    elevenlabs: {
      ...preset.elevenlabs,
      ...file.elevenlabs,
      ...(nonEmpty(env.ELEVENLABS_VOICE_ID)
        ? { voiceId: nonEmpty(env.ELEVENLABS_VOICE_ID)! }
        : {}),
      ...(nonEmpty(env.ELEVENLABS_MODEL_ID)
        ? { modelId: nonEmpty(env.ELEVENLABS_MODEL_ID)! }
        : {}),
      settings: { ...preset.elevenlabs.settings, ...file.elevenlabs?.settings },
      ...(elevenKey ? { apiKey: elevenKey } : {}),
    },
    openai: {
      ...preset.openai,
      ...file.openai,
      ...fromEnv("voiceId", "OPENAI_TTS_VOICE"),
      ...fromEnv("model", "OPENAI_TTS_MODEL"),
      ...(openaiKey ? { apiKey: openaiKey } : {}),
    },
    azure: {
      ...preset.azure,
      ...file.azure,
      ...fromEnv("voiceId", "AZURE_SPEECH_VOICE"),
      ...fromEnv("region", "AZURE_SPEECH_REGION"),
      ...(azureKey ? { apiKey: azureKey } : {}),
    },
    playht: {
      ...preset.playht,
      ...file.playht,
      ...(nonEmpty(env.PLAYHT_VOICE_ID)
        ? { voiceId: nonEmpty(env.PLAYHT_VOICE_ID)! }
        : {}),
      ...(nonEmpty(env.PLAYHT_VOICE_ENGINE)
        ? { voiceEngine: nonEmpty(env.PLAYHT_VOICE_ENGINE)! }
        : {}),
      ...(playKey ? { apiKey: playKey } : {}),
      ...(playUser ? { userId: playUser } : {}),
    },
  };
  return validateVoiceConfig(config);
}

function inRange(value: number, min: number, max: number, name: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(
      `${name} must be between ${min} and ${max} (got ${value}).`,
    );
  }
}

export function validateVoiceConfig(config: VoiceConfig): VoiceConfig {
  inRange(config.maxChars, 1, 5000, "voice.maxChars");
  inRange(config.timeoutSeconds, 1, 300, "voice.timeoutSeconds");
  const s = config.elevenlabs.settings;
  inRange(s.stability, 0, 1, "voice.elevenlabs.settings.stability");
  inRange(
    s.similarity_boost,
    0,
    1,
    "voice.elevenlabs.settings.similarity_boost",
  );
  inRange(s.style, 0, 1, "voice.elevenlabs.settings.style");
  inRange(s.speed, 0.7, 1.2, "voice.elevenlabs.settings.speed");
  inRange(config.playht.speed, 0.1, 5, "voice.playht.speed");
  inRange(config.playht.temperature, 0, 2, "voice.playht.temperature");
  if (!config.elevenlabs.voiceId)
    throw new Error("voice.elevenlabs.voiceId is empty.");
  if (!config.playht.voiceId) throw new Error("voice.playht.voiceId is empty.");
  if (!config.openai.voiceId) throw new Error("voice.openai.voiceId is empty.");
  if (!/^[a-zA-Z]{2,3}-[a-zA-Z]{2,4}-\w+$/.test(config.azure.voiceId)) {
    throw new Error(
      `voice.azure.voiceId must look like "en-US-AvaNeural" (got "${config.azure.voiceId}").`,
    );
  }
  if (config.azure.region && !/^[a-z0-9]+$/.test(config.azure.region)) {
    throw new Error(
      `AZURE_SPEECH_REGION must be a region name like "eastus" (got "${config.azure.region}").`,
    );
  }
  for (const key of ["rate", "pitch"] as const) {
    if (!/^[+-]?\d+(\.\d+)?%$/.test(config.azure[key])) {
      throw new Error(
        `voice.azure.${key} must be a percentage like "-8%" (got "${config.azure[key]}").`,
      );
    }
  }
  return config;
}

/** Escape text for an SSML (XML) document. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Why a provider cannot be used, or undefined when its keys are set. */
export function missingCredentials(
  config: VoiceConfig,
  provider: VoiceProviderName,
): string | undefined {
  if (provider === "elevenlabs") {
    return config.elevenlabs.apiKey
      ? undefined
      : "ELEVENLABS_API_KEY is not set";
  }
  if (provider === "openai") {
    return config.openai.apiKey ? undefined : "OPENAI_API_KEY is not set";
  }
  if (provider === "azure") {
    const missing = [
      config.azure.apiKey ? undefined : "AZURE_SPEECH_KEY",
      config.azure.region ? undefined : "AZURE_SPEECH_REGION",
    ].filter(Boolean);
    return missing.length ? `${missing.join(" and ")} not set` : undefined;
  }
  const missing = [
    config.playht.apiKey ? undefined : "PLAYHT_API_KEY",
    config.playht.userId ? undefined : "PLAYHT_USER_ID",
  ].filter(Boolean);
  return missing.length ? `${missing.join(" and ")} not set` : undefined;
}

/** Collapse whitespace and cut long text at a sentence or word boundary. */
export function prepareSpeechText(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const sentence = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
  );
  if (sentence > maxChars / 2) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(" ");
  return space > 0 ? cut.slice(0, space) : cut;
}

export interface SpeechRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** The HTTP request for a provider. Exported for tests; contains the API key. */
export function buildSpeechRequest(
  config: VoiceConfig,
  provider: VoiceProviderName,
  text: string,
): SpeechRequest {
  if (provider === "elevenlabs") {
    const e = config.elevenlabs;
    return {
      url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(e.voiceId)}?output_format=${encodeURIComponent(e.outputFormat)}`,
      headers: {
        "xi-api-key": e.apiKey ?? "",
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: e.modelId,
        voice_settings: e.settings,
      }),
    };
  }
  if (provider === "openai") {
    const o = config.openai;
    return {
      url: "https://api.openai.com/v1/audio/speech",
      headers: {
        authorization: `Bearer ${o.apiKey ?? ""}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: o.model,
        voice: o.voiceId,
        input: text,
        instructions: o.instructions,
        response_format: "mp3",
      }),
    };
  }
  if (provider === "azure") {
    const a = config.azure;
    const lang = a.voiceId.split("-").slice(0, 2).join("-");
    return {
      url: `https://${a.region ?? ""}.tts.speech.microsoft.com/cognitiveservices/v1`,
      headers: {
        "Ocp-Apim-Subscription-Key": a.apiKey ?? "",
        "content-type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        "user-agent": "light-compact-ai",
      },
      body:
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
        `<voice name="${escapeXml(a.voiceId)}">` +
        `<prosody rate="${a.rate}" pitch="${a.pitch}">${escapeXml(text)}</prosody>` +
        `</voice></speak>`,
    };
  }
  const p = config.playht;
  return {
    url: "https://api.play.ht/api/v2/tts/stream",
    headers: {
      AUTHORIZATION: p.apiKey ?? "",
      "X-USER-ID": p.userId ?? "",
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      voice: p.voiceId,
      voice_engine: p.voiceEngine,
      output_format: "mp3",
      speed: p.speed,
      temperature: p.temperature,
    }),
  };
}

export interface SpeechResult {
  audio: Buffer;
  /** Always "audio/mpeg" (every provider is asked for MP3). */
  contentType: string;
  provider: VoiceProviderName;
  /** The text that was spoken (after cleanup and truncation). */
  text: string;
}

export interface SynthesizeOptions {
  /** Provider to try first (defaults to config.provider). */
  provider?: VoiceProviderName;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
}

const PROVIDER_LABELS: Record<VoiceProviderName, string> = {
  elevenlabs: "ElevenLabs",
  openai: "OpenAI",
  azure: "Azure",
  playht: "Play.ht",
};

async function callProvider(
  config: VoiceConfig,
  provider: VoiceProviderName,
  text: string,
  fetchImpl: typeof fetch,
): Promise<Buffer> {
  const request = buildSpeechRequest(config, provider, text);
  const response = await fetchImpl(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(config.timeoutSeconds * 1000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => ""))
      .replace(/\s+/g, " ")
      .slice(0, 300);
    throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length === 0) throw new Error("empty audio response");
  return audio;
}

/**
 * Turn text into MP3 audio. Tries the chosen provider, then (if fallback is on)
 * the others in VOICE_PROVIDERS order. Throws with every provider's reason when all fail.
 */
export async function synthesize(
  text: string,
  config: VoiceConfig,
  options: SynthesizeOptions = {},
): Promise<SpeechResult> {
  const spoken = prepareSpeechText(text, config.maxChars);
  if (!spoken) throw new Error("nothing to say: text is empty");

  const first = options.provider ?? config.provider;
  const order: VoiceProviderName[] = config.fallback
    ? [first, ...VOICE_PROVIDERS.filter((p) => p !== first)]
    : [first];
  const fetchImpl = options.fetchImpl ?? fetch;
  const failures: string[] = [];

  for (const provider of order) {
    const missing = missingCredentials(config, provider);
    if (missing) {
      failures.push(`${PROVIDER_LABELS[provider]}: ${missing}`);
      continue;
    }
    try {
      const audio = await callProvider(config, provider, spoken, fetchImpl);
      return { audio, contentType: "audio/mpeg", provider, text: spoken };
    } catch (err) {
      // fetch hides network errors behind "fetch failed"; the cause says why.
      const cause = (err as { cause?: { code?: string } } | undefined)?.cause
        ?.code;
      const reason =
        err instanceof Error && err.name === "TimeoutError"
          ? `timed out after ${config.timeoutSeconds}s`
          : cause === "ENOTFOUND"
            ? "service unreachable (host not found)"
            : err instanceof Error
              ? err.message + (cause ? ` (${cause})` : "")
              : String(err);
      failures.push(`${PROVIDER_LABELS[provider]}: ${reason}`);
    }
  }
  throw new Error(`voice failed (${failures.join("; ")})`);
}

/** Safe summary for status displays (no keys). */
export function describeVoice(config: VoiceConfig): {
  preset: string;
  provider: VoiceProviderName;
  fallback: boolean;
  providers: Record<
    VoiceProviderName,
    { ready: boolean; reason?: string; voiceId: string }
  >;
} {
  const status = (provider: VoiceProviderName) => {
    const reason = missingCredentials(config, provider);
    return {
      ready: !reason,
      ...(reason ? { reason } : {}),
      voiceId: config[provider].voiceId,
    };
  };
  return {
    preset: config.preset,
    provider: config.provider,
    fallback: config.fallback,
    providers: Object.fromEntries(
      VOICE_PROVIDERS.map((p) => [p, status(p)]),
    ) as Record<
      VoiceProviderName,
      { ready: boolean; reason?: string; voiceId: string }
    >,
  };
}

export function providerLabel(provider: VoiceProviderName): string {
  return PROVIDER_LABELS[provider];
}
