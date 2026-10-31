/**
 * HTTP server for the compact AI.
 *
 * Routes:
 *   GET  /health    -> { status, vocabSize }
 *   POST /generate  -> body { prompt: string, maxTokens?, temperature?, topK?, topP?, repetitionPenalty? }
 *                   -> { prompt, maxTokens, temperature, topK, topP, repetitionPenalty, output }
 *
 * Settings come from compact.config.json and environment variables
 * (PORT, MODEL_PATH, CORPUS, LCAI_STARTUP_EPOCHS, LCAI_MAX_TOKENS; see .env.example).
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
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  toSamplingOptions,
} from "./settings/user-settings.js";

const config = loadCompactConfig();
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

const server = createServer((req, res) => {
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
    routes: ["GET /health", "POST /generate"],
  });
});

server.listen(PORT, () => {
  const source = savedBundle ? `model ${MODEL_PATH}` : "trained at startup";
  console.log(
    `light-compact-ai server listening on http://localhost:${PORT} (${source}, vocab ${bundle.tokenizer.vocabSize})`,
  );
});
