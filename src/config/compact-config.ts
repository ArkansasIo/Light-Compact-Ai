/**
 * Settings for the compact AI (model size, training, generation, server).
 *
 * Values are resolved in this order, later ones winning:
 *   1. Built-in defaults (DEFAULT_COMPACT_CONFIG)
 *   2. compact.config.json in the working directory (or the LCAI_CONFIG path)
 *   3. Environment variables (see .env.example)
 */
import { existsSync, readFileSync } from "node:fs";

export interface CompactConfig {
  model: {
    dModel: number;
    numHeads: number;
    dFeedForward: number;
    numLayers: number;
    maxSequenceLength: number;
    seed: number;
  };
  training: {
    corpus: string;
    epochs: number;
    learningRate: number;
    output: string;
  };
  generation: {
    maxTokens: number;
  };
  server: {
    port: number;
    startupEpochs: number;
  };
}

export const DEFAULT_CONFIG_PATH = "compact.config.json";

export const DEFAULT_COMPACT_CONFIG: CompactConfig = {
  model: {
    dModel: 32,
    numHeads: 4,
    dFeedForward: 64,
    numLayers: 2,
    maxSequenceLength: 32,
    seed: 7,
  },
  training: {
    corpus: "data/corpus.txt",
    epochs: 40,
    learningRate: 0.003,
    output: "models/compact.checkpoint.json",
  },
  generation: { maxTokens: 24 },
  server: { port: 3000, startupEpochs: 15 },
};

/** Every section optional, every field in a section optional. */
export type PartialCompactConfig = {
  [S in keyof CompactConfig]?: Partial<CompactConfig[S]>;
};

function positiveInt(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer (got ${value}).`);
  }
}

function positiveNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number (got ${value}).`);
  }
}

function nonEmpty(value: string, name: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }
}

/** Read a numeric env var, or undefined when it is not set. */
function envNumber(env: NodeJS.ProcessEnv, name: string): number | undefined {
  const raw = env[name];
  return raw === undefined || raw === "" ? undefined : Number(raw);
}

/** Remove undefined values so they do not overwrite earlier settings. */
function definedOnly<T extends object>(
  obj: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

/** Merge a partial config over a full one, section by section. */
export function mergeCompactConfig(
  base: CompactConfig,
  patch: PartialCompactConfig,
): CompactConfig {
  return {
    model: { ...base.model, ...patch.model },
    training: { ...base.training, ...patch.training },
    generation: { ...base.generation, ...patch.generation },
    server: { ...base.server, ...patch.server },
  };
}

/** Check every field and throw a readable error for the first bad one. */
export function validateCompactConfig(config: CompactConfig): CompactConfig {
  const { model, training, generation, server } = config;

  positiveInt(model.dModel, "model.dModel");
  positiveInt(model.numHeads, "model.numHeads");
  if (model.dModel % model.numHeads !== 0) {
    throw new Error("model.dModel must be divisible by model.numHeads.");
  }
  positiveInt(model.dFeedForward, "model.dFeedForward");
  positiveInt(model.numLayers, "model.numLayers");
  positiveInt(model.maxSequenceLength, "model.maxSequenceLength");
  if (!Number.isSafeInteger(model.seed)) {
    throw new Error("model.seed must be an integer.");
  }

  nonEmpty(training.corpus, "training.corpus");
  positiveInt(training.epochs, "training.epochs");
  positiveNumber(training.learningRate, "training.learningRate");
  nonEmpty(training.output, "training.output");

  positiveInt(generation.maxTokens, "generation.maxTokens");

  if (
    !Number.isSafeInteger(server.port) ||
    server.port < 1 ||
    server.port > 65535
  ) {
    throw new Error("server.port must be between 1 and 65535.");
  }
  positiveInt(server.startupEpochs, "server.startupEpochs");

  return config;
}

/** Load defaults + config file + environment overrides, then validate. */
export function loadCompactConfig(
  env: NodeJS.ProcessEnv = process.env,
): CompactConfig {
  let config = DEFAULT_COMPACT_CONFIG;

  const path = env.LCAI_CONFIG ?? DEFAULT_CONFIG_PATH;
  if (existsSync(path)) {
    let fromFile: PartialCompactConfig;
    try {
      fromFile = JSON.parse(readFileSync(path, "utf8")) as PartialCompactConfig;
    } catch (err) {
      throw new Error(
        `could not parse ${path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    config = mergeCompactConfig(config, fromFile);
  } else if (env.LCAI_CONFIG) {
    throw new Error(`config file not found: ${path}`);
  }

  config = mergeCompactConfig(config, {
    training: definedOnly({
      corpus: env.CORPUS,
      epochs: envNumber(env, "EPOCHS"),
      learningRate: envNumber(env, "LCAI_LEARNING_RATE"),
      output: env.MODEL_PATH,
    }),
    generation: definedOnly({
      maxTokens: envNumber(env, "LCAI_MAX_TOKENS"),
    }),
    server: definedOnly({
      port: envNumber(env, "PORT"),
      startupEpochs: envNumber(env, "LCAI_STARTUP_EPOCHS"),
    }),
  });

  return validateCompactConfig(config);
}
