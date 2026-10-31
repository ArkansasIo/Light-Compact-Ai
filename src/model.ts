import {
  Embedding,
  LayerNorm,
  Linear,
  Matrix,
  ParameterStore,
  Random,
  TransformerBlock,
  matmul,
  transpose,
  zeros,
  softmax,
} from "./engine.js";
export interface TransformerConfig {
  vocabSize: number;
  maxSequenceLength: number;
  dModel: number;
  numHeads: number;
  dFeedForward: number;
  numLayers: number;
  seed?: number;
  causal?: boolean;
}
export class TransformerModel {
  readonly config: Required<TransformerConfig>;
  readonly parameters = new ParameterStore();
  private token: Embedding;
  private position: Embedding;
  private blocks: TransformerBlock[];
  private output: Linear;
  private hiddenCache: Matrix[] = [];
  private lastIds: number[] = [];
  constructor(config: TransformerConfig) {
    if (config.dModel % config.numHeads !== 0)
      throw Error("dModel must be divisible by numHeads");
    if (
      config.vocabSize < 2 ||
      config.maxSequenceLength < 1 ||
      config.numLayers < 1
    )
      throw Error("invalid model dimensions");
    this.config = {
      ...config,
      seed: config.seed ?? 42,
      causal: config.causal ?? true,
    };
    const rng = new Random(this.config.seed);
    this.token = new Embedding(
      this.parameters,
      "emb.token",
      config.vocabSize,
      config.dModel,
      rng,
    );
    this.position = new Embedding(
      this.parameters,
      "emb.position",
      config.maxSequenceLength,
      config.dModel,
      rng,
    );
    this.blocks = Array.from(
      { length: config.numLayers },
      (_, i) =>
        new TransformerBlock(
          this.parameters,
          "layer." + i,
          config.dModel,
          config.numHeads,
          config.dFeedForward,
          rng,
        ),
    );
    this.output = new Linear(
      this.parameters,
      "lm_head",
      config.dModel,
      config.vocabSize,
      rng,
    );
  }
  forward(ids: number[]): Matrix {
    if (ids.length < 1 || ids.length > this.config.maxSequenceLength)
      throw Error("sequence length outside model limits");
    this.lastIds = [...ids];
    const t = this.token.forward(ids),
      p = this.position.forward(ids.map((_, i) => i));
    let x = t.map((r, i) => r.map((v, j) => v + p[i]![j]!));
    this.hiddenCache = [x];
    for (const block of this.blocks) {
      x = block.forward(x, this.config.causal);
      this.hiddenCache.push(x);
    }
    return this.output.forward(x);
  }
  private crossEntropy(
    logits: Matrix,
    targets: number[],
  ): { loss: number; grad: Matrix; count: number } {
    if (logits.length !== targets.length)
      throw Error("target sequence length mismatch");
    const grad = zeros(logits.length, this.config.vocabSize);
    let loss = 0,
      count = 0;
    for (let i = 0; i < targets.length; i++) {
      const id = targets[i]!;
      if (id === -100) continue;
      if (id < 0 || id >= this.config.vocabSize)
        throw Error("target token out of range");
      const p = softmax(logits[i]!);
      loss -= Math.log(Math.max(p[id]!, 1e-12));
      count++;
      for (let j = 0; j < p.length; j++) grad[i]![j] = p[j]!;
      grad[i]![id]! -= 1;
    }
    if (!count) throw Error("no non-masked targets");
    return {
      loss: loss / count,
      grad: grad.map((r) => r.map((v) => v / count)),
      count,
    };
  }
  lossAndGrad(
    ids: number[],
    targets: number[],
  ): { loss: number; tokens: number } {
    this.parameters.clear();
    const logits = this.forward(ids),
      ce = this.crossEntropy(logits, targets);
    let dx = this.output.backward(
      this.hiddenCache[this.hiddenCache.length - 1]!,
      ce.grad,
    );
    for (let i = this.blocks.length - 1; i >= 0; i--)
      dx = this.blocks[i]!.backward(dx);
    this.token.backward(ids, dx);
    this.position.backward(
      ids.map((_, i) => i),
      dx,
    );
    return { loss: ce.loss, tokens: ce.count };
  }
  predictNext(ids: number[]): number {
    const l = this.forward(ids),
      r = l[l.length - 1]!;
    let best = 0;
    for (let i = 1; i < r.length; i++) if (r[i]! > r[best]!) best = i;
    return best;
  }
  generate(prompt: number[], maxTokens: number): number[] {
    const out = [...prompt];
    for (let i = 0; i < maxTokens; i++)
      out.push(this.predictNext(out.slice(-this.config.maxSequenceLength)));
    return out;
  }
  state(): Record<string, Matrix> {
    return this.parameters.state();
  }
  loadState(s: Record<string, Matrix>): void {
    this.parameters.load(s);
  }
}
