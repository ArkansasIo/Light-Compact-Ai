/**
 * HTTP server for the compact AI.
 *
 * Routes:
 *   GET  /health    -> { status, vocabSize }
 *   POST /generate  -> body { prompt: string, maxTokens?, temperature?, topK?, topP?, repetitionPenalty? }
 *                   -> { prompt, maxTokens, temperature, topK, topP, repetitionPenalty, output }
 *
 *   GET  /voice     -> voice status: preset, provider order, which providers have keys
 *   POST /speak     -> body { text: string } or { prompt: string, maxTokens?, ...sampling },
 *                      optional provider: "elevenlabs" | "openai" | "azure" | "playht"
 *                   -> audio/mpeg (headers X-Voice-Provider, X-Voice-Text)
 *   POST /compose   -> body { prompt, style?, key?, tempo?, meter?, seed?, voices?, lyrics?, form? }
 *                   -> the song arrangement as JSON (lyrics, sections, note tracks)
 *   POST /sing      -> same body -> audio/wav of the mixed song (headers X-Song-Title, X-Song-Key)
 *                      One render at a time; rendering blocks for a few seconds.
 *
 * Settings come from compact.config.json, .env, and environment variables
 * (PORT, MODEL_PATH, CORPUS, LCAI_STARTUP_EPOCHS, LCAI_MAX_TOKENS, voice keys; see .env.example).
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import {
  loadBundle,
  trainCompact,
  readCorpus,
  reply,
} from "./compact/bundle.js";
import { loadCompactConfig } from "./config/compact-config.js";
import { loadDotEnv } from "./config/env.js";
import { encodeWav } from "./audio/wav.js";
import {
  createSong,
  renderSong,
  type SongRequest,
} from "./musical-mode/song.js";
import { loadVoiceProfiles } from "./profiles/voices.js";
import {
  describeVoice,
  isVoiceProvider,
  loadVoiceConfig,
  synthesize,
  VOICE_PROVIDERS,
} from "./voice/voice.js";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  toSamplingOptions,
} from "./settings/user-settings.js";

loadDotEnv();
const config = loadCompactConfig();
const voice = loadVoiceConfig();
const PORT = config.server.port;
const MODEL_PATH = config.training.output;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TOKENS = 64;
const DEFAULT_TOKENS = Math.min(config.generation.maxTokens, MAX_TOKENS);

// Use the saved model if there is one; otherwise train a quick one at startup.
const savedBundle = loadBundle(MODEL_PATH);
const bundle =
  savedBundle ??
  trainCompact(readCorpus(readFileSync(config.training.corpus, "utf8")), {
    ...config.model,
    learningRate: config.training.learningRate,
    epochs: config.server.startupEpochs,
  });

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Read the request body, rejecting anything larger than MAX_BODY_BYTES. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk;
      if (data.length > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/** Clamp the requested token count to 1..MAX_TOKENS. */
function parseMaxTokens(value: unknown): number {
  const requested =
    Math.floor(Number(value ?? DEFAULT_TOKENS)) || DEFAULT_TOKENS;
  return Math.min(Math.max(requested, 1), MAX_TOKENS);
}

async function handleGenerate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: Record<string, unknown> & { prompt?: unknown; maxTokens?: unknown };
  try {
    body = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return sendJson(res, 400, { error: "invalid JSON body" });
  }

  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return sendJson(res, 400, { error: "prompt must be a non-empty string" });
  }

  const maxTokens = parseMaxTokens(body.maxTokens);
  // Optional sampling options in the body; invalid values fall back to greedy defaults.
  const options = normalizeSettings(body, DEFAULT_SETTINGS);
  const sampling = toSamplingOptions(options);
  const output = reply(bundle, body.prompt, maxTokens, sampling);
  sendJson(res, 200, {
    prompt: body.prompt,
    maxTokens,
    temperature: options.temperature,
    topK: options.topK,
    topP: options.topP,
    repetitionPenalty: options.repetitionPenalty,
    output,
  });
}

async function handleSpeak(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return sendJson(res, 400, { error: "invalid JSON body" });
  }

  if (body.provider !== undefined && !isVoiceProvider(body.provider)) {
    return sendJson(res, 400, {
      error: `provider must be one of ${VOICE_PROVIDERS.join(", ")}`,
    });
  }

  // Speak the given text, or generate a reply to a prompt and speak that.
  let text: string;
  if (typeof body.text === "string" && body.text.trim()) {
    text = body.text;
  } else if (typeof body.prompt === "string" && body.prompt.trim()) {
    const options = normalizeSettings(body, DEFAULT_SETTINGS);
    text = reply(
      bundle,
      body.prompt,
      parseMaxTokens(body.maxTokens),
      toSamplingOptions(options),
    );
    if (!text.trim()) {
      return sendJson(res, 422, {
        error: "the model produced no text to speak",
      });
    }
  } else {
    return sendJson(res, 400, {
      error:
        "send text (string to speak) or prompt (string to answer and speak)",
    });
  }

  try {
    const result = await synthesize(text, voice, {
      ...(isVoiceProvider(body.provider) ? { provider: body.provider } : {}),
    });
    res.writeHead(200, {
      "content-type": result.contentType,
      "content-length": result.audio.length,
      "x-voice-provider": result.provider,
      "x-voice-text": encodeURIComponent(result.text),
    });
    res.end(result.audio);
  } catch (err) {
    sendJson(res, 502, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const profiles = loadVoiceProfiles();
let rendering = false;

/** Build a SongRequest from an untrusted JSON body (createSong validates values). */
function songRequestFrom(body: Record<string, unknown>): SongRequest {
  const str = (k: string) =>
    typeof body[k] === "string" ? { [k]: body[k] as string } : {};
  const num = (k: string) =>
    typeof body[k] === "number" ? { [k]: body[k] as number } : {};
  const voices = Array.isArray(body.voices)
    ? body.voices.filter((v): v is string => typeof v === "string")
    : [];
  return {
    prompt: typeof body.prompt === "string" ? body.prompt : "",
    ...str("style"),
    ...str("key"),
    ...str("lyrics"),
    ...num("tempo"),
    ...num("meter"),
    ...num("seed"),
    ...(voices.length ? { voices } : {}),
    ...(body.form === "full" || body.form === "short"
      ? { form: body.form }
      : {}),
  };
}

async function handleSong(
  req: IncomingMessage,
  res: ServerResponse,
  audio: boolean,
): Promise<void> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return sendJson(res, 400, { error: "invalid JSON body" });
  }
  let song;
  try {
    song = createSong(songRequestFrom(body), profiles);
  } catch (err) {
    return sendJson(res, 400, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  if (!audio) return sendJson(res, 200, song);

  if (rendering) {
    return sendJson(res, 503, {
      error: "a song is already rendering; try again shortly",
    });
  }
  rendering = true;
  try {
    const rendered = await renderSong(song, { profiles });
    const wav = encodeWav(rendered.mix, rendered.sampleRate);
    res.writeHead(200, {
      "content-type": "audio/wav",
      "content-length": wav.length,
      "x-song-title": encodeURIComponent(song.title),
      "x-song-key": song.key,
      "x-song-tempo": String(song.tempo),
    });
    res.end(wav);
  } finally {
    rendering = false;
  }
}

const server = createServer((req, res) => {
  if (
    req.method === "POST" &&
    (req.url === "/compose" || req.url === "/sing")
  ) {
    handleSong(req, res, req.url === "/sing").catch((err: unknown) => {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return;
  }

  if (req.method === "GET" && req.url === "/voice") {
    return sendJson(res, 200, describeVoice(voice));
  }

  if (req.method === "POST" && req.url === "/speak") {
    handleSpeak(req, res).catch((err: unknown) => {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, {
      status: "ok",
      vocabSize: bundle.tokenizer.vocabSize,
    });
  }

  if (req.method === "POST" && req.url === "/generate") {
    handleGenerate(req, res).catch((err: unknown) => {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return;
  }

  sendJson(res, 404, {
    error: "not found",
    routes: [
      "GET /health",
      "POST /generate",
      "GET /voice",
      "POST /speak",
      "POST /compose",
      "POST /sing",
    ],
  });
});

server.listen(PORT, () => {
  const source = savedBundle ? `model ${MODEL_PATH}` : "trained at startup";
  console.log(
    `light-compact-ai server listening on http://localhost:${PORT} (${source}, vocab ${bundle.tokenizer.vocabSize})`,
  );
});
