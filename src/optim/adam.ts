import { ParameterStore } from "../core/parameters.js";
export interface AdamConfig {
  learningRate?: number;
  beta1?: number;
  beta2?: number;
  epsilon?: number;
  weightDecay?: number;
  maxGradNorm?: number;
}
export class AdamOptimizer {
  private stepCount = 0;
  private readonly m: Map<string, number[][]> = new Map();
  private readonly v: Map<string, number[][]> = new Map();
  readonly config: Required<AdamConfig>;
  constructor(
    private readonly store: ParameterStore,
    config: AdamConfig = {},
  ) {
    this.config = {
      learningRate: config.learningRate ?? 1e-3,
      beta1: config.beta1 ?? 0.9,
      beta2: config.beta2 ?? 0.999,
      epsilon: config.epsilon ?? 1e-8,
      weightDecay: config.weightDecay ?? 0,
      maxGradNorm: config.maxGradNorm ?? 1,
    };
  }
  step(): void {
    this.stepCount++;
    let norm2 = 0;
    for (const p of this.store.parameters)
      for (const row of p.grad) for (const g of row) norm2 += g * g;
    const norm = Math.sqrt(norm2),
      clip =
        norm > this.config.maxGradNorm
          ? this.config.maxGradNorm / (norm + 1e-12)
          : 1;
    const {
      learningRate: lr,
      beta1: b1,
      beta2: b2,
      epsilon,
      weightDecay,
    } = this.config;
    for (const p of this.store.parameters) {
      let m = this.m.get(p.name),
        v = this.v.get(p.name);
      if (!m) {
        m = p.value.map((r) => r.map(() => 0));
        v = p.value.map((r) => r.map(() => 0));
        this.m.set(p.name, m);
        this.v.set(p.name, v);
      }
      for (let i = 0; i < p.value.length; i++)
        for (let j = 0; j < p.value[i]!.length; j++) {
          const g = p.grad[i]![j]! * clip;
          m[i]![j] = b1 * m[i]![j]! + (1 - b1) * g;
          v![i]![j] = b2 * v![i]![j]! + (1 - b2) * g * g;
          const mh = m[i]![j]! / (1 - Math.pow(b1, this.stepCount)),
            vh = v![i]![j]! / (1 - Math.pow(b2, this.stepCount));
          p.value[i]![j]! -=
            lr *
            (mh / (Math.sqrt(vh) + epsilon) + weightDecay * p.value[i]![j]!);
        }
    }
  }
  get steps(): number {
    return this.stepCount;
  }
}
