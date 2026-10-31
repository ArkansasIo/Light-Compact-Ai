/**
 * Compact AI bundle: a trained TransformerModel plus the tokenizer it was
 * trained with, saved together as a single JSON file so it can be reloaded
 * later for chatting or serving.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { TransformerModel, type TransformerConfig } from "../model.js";
import { VocabularyTokenizer } from "../tokenizer.js";
import { Trainer } from "../training.js";
import { sampleLogits, type SamplingOptions } from "../engine/sampling.js";

/** A trained model and its matching tokenizer. */
export interface CompactBundle {
  model: TransformerModel;
  tokenizer: VocabularyTokenizer;
}

/** Options for training a compact model. Every field has a sensible default. */
export interface CompactTrainOptions {
  /** Number of passes over the corpus. Default: 40. */
  epochs?: number;
  /** Adam learning rate. Default: 0.003. */
  learningRate?: number;
  /** Embedding / hidden size. Default: 32. */
  dModel?: number;
  /** Attention heads; must divide dModel. Default: 4. */
  numHeads?: number;
  /** Feed-forward inner size. Default: 64. */
  dFeedForward?: number;
  /** Number of transformer blocks. Default: 2. */
  numLayers?: number;
  /** Maximum tokens the model sees at once. Default: 32. */
  maxSequenceLength?: number;
  /** Random seed for reproducible weights. Default: 7. */
  seed?: number;
  /** Called after each epoch with the average loss. */
  onEpoch?: (epoch: number, loss: number) => void;
}

/** Shape of the JSON file written by saveBundle. */
interface SerializedBundle {
  format: string;
  version: number;
  config: TransformerConfig;
  tokenizer: string[];
  parameters: Parameters<TransformerModel["loadState"]>[0];
}

const FORMAT = "light-compact-ai/bundle";
const VERSION = 1;
/** Token id of <eos> in VocabularyTokenizer. */
const EOS_ID = 3;

/** Where `npm run train` saves the model and where chat/server look for it. */
export const DEFAULT_BUNDLE_PATH = "models/compact.checkpoint.json";

/**
 * Turn corpus text into training lines.
 * Blank lines and lines starting with "#" are ignored.
 */
export function readCorpus(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/** A training run that can be advanced one epoch at a time (used by the chat UI). */
export interface TrainingSession {
  /** The model being trained and its tokenizer. */
  bundle: CompactBundle;
  /** Total epochs requested. */
  epochs: number;
  /** Number of training windows built from the corpus. */
  sampleCount: number;
  /** Train one pass over every sample and return the average loss. */
  runEpoch(): number;
}

/** Fit a tokenizer on the corpus and train a small decoder-only model on it. */
export function trainCompact(
  lines: string[],
  options: CompactTrainOptions = {},
): CompactBundle {
  const session = prepareTraining(lines, options);
  for (let epoch = 0; epoch < session.epochs; epoch++) {
    const loss = session.runEpoch();
    options.onEpoch?.(epoch, loss);
  }
  return session.bundle;
}

/** Build the tokenizer, model and samples, but leave the epochs to the caller. */
export function prepareTraining(
  lines: string[],
  options: CompactTrainOptions = {},
): TrainingSession {
  if (lines.length === 0) {
    throw new Error("corpus is empty");
  }

  const tokenizer = new VocabularyTokenizer().fit(lines);
  const maxSequenceLength = options.maxSequenceLength ?? 32;

  const config: TransformerConfig = {
    vocabSize: tokenizer.vocabSize,
    maxSequenceLength,
    dModel: options.dModel ?? 32,
    numHeads: options.numHeads ?? 4,
    dFeedForward: options.dFeedForward ?? 64,
    numLayers: options.numLayers ?? 2,
    seed: options.seed ?? 7,
  };

  const model = new TransformerModel(config);
  const trainer = new Trainer(model, {
    learningRate: options.learningRate ?? 0.003,
  });

  // Encode each line as <bos> tokens... <eos>. Lines longer than the model
  // context are cut into windows of maxSequenceLength + 1 tokens (the extra
  // token is needed because targets are the inputs shifted by one).
  const samples: number[][] = [];
  for (const line of lines) {
    const ids = tokenizer.encode(line, true, true);
    for (let start = 0; start < ids.length - 1; start += maxSequenceLength) {
      samples.push(ids.slice(start, start + maxSequenceLength + 1));
    }
  }

  return {
    bundle: { model, tokenizer },
    epochs: options.epochs ?? 40,
    sampleCount: samples.length,
    runEpoch(): number {
      let totalLoss = 0;
      for (const ids of samples) {
        const input = ids.slice(0, -1);
        const target = ids.slice(1);
        totalLoss += trainer.trainSequence(input, target).loss;
      }
      return totalLoss / samples.length;
    },
  };
}

/** Convert a bundle to a JSON string. */
export function serializeBundle(bundle: CompactBundle): string {
  const data: SerializedBundle = {
    format: FORMAT,
    version: VERSION,
    config: bundle.model.config,
    tokenizer: bundle.tokenizer.vocabulary,
    parameters: bundle.model.state(),
  };
  return JSON.stringify(data);
}

/** Rebuild a bundle from a JSON string produced by serializeBundle. */
export function deserializeBundle(json: string): CompactBundle {
  const data = JSON.parse(json) as Partial<SerializedBundle>;
  if (data.format !== FORMAT || data.version !== VERSION) {
    throw new Error("unsupported bundle format");
  }
  if (!data.config || !data.tokenizer || !data.parameters) {
    throw new Error("bundle is missing config, tokenizer or parameters");
  }

  const tokenizer = new VocabularyTokenizer();
  tokenizer.load(JSON.stringify(data.tokenizer));

  const model = new TransformerModel(data.config);
  model.loadState(data.parameters);

  return { model, tokenizer };
}

/** Write a bundle to disk, creating the folder if needed. */
export function saveBundle(
  bundle: CompactBundle,
  path: string = DEFAULT_BUNDLE_PATH,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeBundle(bundle));
}

/** Load a bundle from disk, or return undefined if the file does not exist. */
export function loadBundle(
  path: string = DEFAULT_BUNDLE_PATH,
): CompactBundle | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  return deserializeBundle(readFileSync(path, "utf8"));
}

/**
 * Continue a prompt one token at a time, stopping at <eos> or after maxTokens.
 * Yields the reply text so far after every new token.
 *
 * Without `sampling` (or with temperature 0) the most likely token is always
 * chosen. With sampling options, tokens are drawn using temperature, top-k,
 * top-p and repetition penalty; pass `sampling.seed` for repeatable output.
 */
export function* streamReply(
  bundle: CompactBundle,
  prompt: string,
  maxTokens = 24,
  sampling?: SamplingOptions,
): Generator<string> {
  const { model, tokenizer } = bundle;
  const contextLimit = model.config.maxSequenceLength;
  const greedy = !sampling || (sampling.temperature ?? 1) === 0;
  // Each token needs a different seed; derive them from the given seed or randomly.
  let seed = sampling?.seed ?? Math.floor(Math.random() * 2 ** 32);

  const context = tokenizer.encode(prompt, true);
  const generated: number[] = [];

  for (let i = 0; i < maxTokens; i++) {
    // Keep only the most recent tokens that fit in the model context.
    const window = context.slice(-contextLimit);
    let next: number;
    if (greedy) {
      next = model.generate(window, 1).at(-1)!;
    } else {
      const logits = model.forward(window).at(-1)!;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      next = sampleLogits(logits, { ...sampling, seed }, context);
    }
    if (next === EOS_ID) {
      break;
    }
    generated.push(next);
    context.push(next);
    yield tokenizer.decode(generated);
  }
}

/** Continue a prompt and return only the newly generated text. */
export function reply(
  bundle: CompactBundle,
  prompt: string,
  maxTokens = 24,
  sampling?: SamplingOptions,
): string {
  let text = "";
  for (const partial of streamReply(bundle, prompt, maxTokens, sampling)) {
    text = partial;
  }
  return text;
}
