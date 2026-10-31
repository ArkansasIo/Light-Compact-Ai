/**
 * Train a compact model on a text corpus and save it.
 *
 * Usage:
 *   npm run train
 *   node dist/cli/train.js [corpus.txt] [output.checkpoint.json]
 *
 * Settings come from compact.config.json and environment variables
 * (see src/config/compact-config.ts). Command-line paths override both.
 */
import { readFileSync } from "node:fs";
import { readCorpus, trainCompact, saveBundle } from "../compact/bundle.js";
import { loadCompactConfig } from "../config/compact-config.js";

const config = loadCompactConfig();
const corpusPath = process.argv[2] ?? config.training.corpus;
const outputPath = process.argv[3] ?? config.training.output;
const { epochs, learningRate } = config.training;

const lines = readCorpus(readFileSync(corpusPath, "utf8"));
console.log(
  `training on ${lines.length} lines from ${corpusPath} for ${epochs} epochs`,
);

const startedAt = Date.now();
const bundle = trainCompact(lines, {
  ...config.model,
  epochs,
  learningRate,
  onEpoch: (epoch, loss) => {
    // Log every 5th epoch and the final one.
    if (epoch % 5 === 0 || epoch === epochs - 1) {
      console.log(`epoch ${epoch} loss ${loss.toFixed(4)}`);
    }
  },
});

saveBundle(bundle, outputPath);

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(
  `saved ${outputPath} (vocab ${bundle.tokenizer.vocabSize}) in ${seconds}s`,
);
