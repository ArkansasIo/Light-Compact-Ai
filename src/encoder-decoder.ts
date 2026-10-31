import { ParameterStore } from "./core/parameters.js";
import { Random } from "./core/random.js";
import { Matrix } from "./core/tensor.js";
import { Embedding } from "./nn/embedding.js";
import { Linear } from "./nn/linear.js";
import { TransformerBlock } from "./nn/transformer-block.js";
import { CrossAttention } from "./nn/cross-attention.js";
export interface EncoderDecoderConfig {
  vocabSize: number;
  maxSourceLength: number;
  maxTargetLength: number;
  dModel: number;
  numHeads: number;
  dFeedForward: number;
  encoderLayers: number;
  decoderLayers: number;
  seed?: number;
}
/**
 * Explicit sequence-to-sequence encoder/decoder architecture.
 * This first implementation is an inference/forward-pass reference; it is not yet
 * connected to the existing Trainer's reverse-mode gradient pipeline.
 */
export class EncoderDecoderTransformer {
  readonly parameters = new ParameterStore();
  readonly config: Required<EncoderDecoderConfig>;
  private sourceEmbedding: Embedding;
  private targetEmbedding: Embedding;
  private sourcePosition: Embedding;
  private targetPosition: Embedding;
  private encoder: TransformerBlock[];
  private decoderSelf: TransformerBlock[];
  private cross: CrossAttention[];
  private lmHead: Linear;
  constructor(c: EncoderDecoderConfig) {
    if (c.dModel % c.numHeads !== 0)
      throw new Error("dModel must be divisible by numHeads");
    if (c.vocabSize < 2 || c.encoderLayers < 1 || c.decoderLayers < 1)
      throw new Error("Invalid encoder-decoder dimensions.");
    this.config = { ...c, seed: c.seed ?? 42 };
    const rng = new Random(this.config.seed);
    this.sourceEmbedding = new Embedding(
      this.parameters,
      "source.token",
      c.vocabSize,
      c.dModel,
      rng,
    );
    this.targetEmbedding = new Embedding(
      this.parameters,
      "target.token",
      c.vocabSize,
      c.dModel,
      rng,
    );
    this.sourcePosition = new Embedding(
      this.parameters,
      "source.position",
      c.maxSourceLength,
      c.dModel,
      rng,
    );
    this.targetPosition = new Embedding(
      this.parameters,
      "target.position",
      c.maxTargetLength,
      c.dModel,
      rng,
    );
    this.encoder = Array.from(
      { length: c.encoderLayers },
      (_, i) =>
        new TransformerBlock(
          this.parameters,
          "encoder." + i,
          c.dModel,
          c.numHeads,
          c.dFeedForward,
          rng,
        ),
    );
    this.decoderSelf = Array.from(
      { length: c.decoderLayers },
      (_, i) =>
        new TransformerBlock(
          this.parameters,
          "decoder.self." + i,
          c.dModel,
          c.numHeads,
          c.dFeedForward,
          rng,
        ),
    );
    this.cross = Array.from(
      { length: c.decoderLayers },
      (_, i) =>
        new CrossAttention(
          this.parameters,
          "decoder.cross." + i,
          c.dModel,
          c.numHeads,
          rng,
        ),
    );
    this.lmHead = new Linear(
      this.parameters,
      "lm_head",
      c.dModel,
      c.vocabSize,
      rng,
    );
  }
  encode(sourceIds: number[]): Matrix {
    if (!sourceIds.length || sourceIds.length > this.config.maxSourceLength)
      throw new Error("Source sequence length out of range.");
    const t = this.sourceEmbedding.forward(sourceIds),
      p = this.sourcePosition.forward(sourceIds.map((_, i) => i));
    let x = t.map((r, i) => r.map((v, j) => v + p[i]![j]!));
    for (const block of this.encoder) x = block.forward(x, false).output;
    return x;
  }
  decode(targetIds: number[], encoderMemory: Matrix): Matrix {
    if (!targetIds.length || targetIds.length > this.config.maxTargetLength)
      throw new Error("Target sequence length out of range.");
    const t = this.targetEmbedding.forward(targetIds),
      p = this.targetPosition.forward(targetIds.map((_, i) => i));
    let x = t.map((r, i) => r.map((v, j) => v + p[i]![j]!));
    for (let i = 0; i < this.decoderSelf.length; i++) {
      x = this.decoderSelf[i]!.forward(x, true).output;
      const attended = this.cross[i]!.forward(x, encoderMemory);
      x = x.map((r, j) => r.map((v, k) => v + attended[j]![k]!));
    }
    return this.lmHead.forward(x);
  }
  forward(sourceIds: number[], targetIds: number[]): Matrix {
    return this.decode(targetIds, this.encode(sourceIds));
  }
  generate(
    sourceIds: number[],
    startToken: number,
    maxTokens: number,
    endToken?: number,
  ): number[] {
    if (!Number.isInteger(maxTokens) || maxTokens < 0)
      throw new Error("maxTokens must be non-negative.");
    const memory = this.encode(sourceIds),
      out = [startToken];
    for (let i = 0; i < maxTokens; i++) {
      const logits = this.decode(out, memory),
        row = logits[logits.length - 1]!;
      let best = 0;
      for (let j = 1; j < row.length; j++) if (row[j]! > row[best]!) best = j;
      out.push(best);
      if (endToken !== undefined && best === endToken) break;
    }
    return out;
  }
}
