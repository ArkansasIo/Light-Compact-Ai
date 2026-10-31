export type WeightFormat =
  | "f32"
  | "f16"
  | "q8"
  | "q6"
  | "q5"
  | "q4"
  | "q3"
  | "q2";
const BITS: Record<WeightFormat, number> = {
  f32: 32,
  f16: 16,
  q8: 8,
  q6: 6,
  q5: 5,
  q4: 4,
  q3: 3,
  q2: 2,
};
export interface ModelMemorySpec {
  parameters: number;
  format: WeightFormat;
  layers: number;
  kvHeads: number;
  headDimension: number;
  contextTokens: number;
  kvBytesPerElement?: 2 | 4;
  runtimeOverheadMiB?: number;
  workspaceMiB?: number;
}
export interface MemoryEstimate {
  weightsMiB: number;
  kvCacheMiB: number;
  runtimeOverheadMiB: number;
  workspaceMiB: number;
  estimatedTotalMiB: number;
  notes: string[];
}
export function estimateModelMemory(s: ModelMemorySpec): MemoryEstimate {
  for (const [k, v] of Object.entries(s))
    if (typeof v === "number" && (!Number.isFinite(v) || v < 0))
      throw new Error(k + " must be non-negative.");
  if (
    !Number.isInteger(s.parameters) ||
    s.parameters < 1 ||
    !Number.isInteger(s.layers) ||
    s.layers < 1 ||
    !Number.isInteger(s.kvHeads) ||
    s.kvHeads < 1 ||
    !Number.isInteger(s.headDimension) ||
    s.headDimension < 1 ||
    !Number.isInteger(s.contextTokens) ||
    s.contextTokens < 1
  )
    throw new Error("Model dimensions must be positive integers.");
  const weightsMiB =
      ((s.parameters * BITS[s.format]) / 8 / 1048576) *
      (s.format.startsWith("q") ? 1.08 : 1),
    kvCacheMiB =
      (2 *
        s.layers *
        s.contextTokens *
        s.kvHeads *
        s.headDimension *
        (s.kvBytesPerElement ?? 2)) /
      1048576,
    runtimeOverheadMiB = s.runtimeOverheadMiB ?? 256,
    workspaceMiB = s.workspaceMiB ?? 256;
  return {
    weightsMiB,
    kvCacheMiB,
    runtimeOverheadMiB,
    workspaceMiB,
    estimatedTotalMiB:
      weightsMiB + kvCacheMiB + runtimeOverheadMiB + workspaceMiB,
    notes: [
      "Planning estimate only; allocator, OS and graph buffers vary.",
      "Quantized metadata overhead is approximated at 8%.",
      "KV cache assumes uncompressed K/V tensors.",
    ],
  };
}
export function recommendContext(
  s: Omit<ModelMemorySpec, "contextTokens">,
  budgetMiB: number,
  requested = 10000,
): { contextTokens: number; estimate: MemoryEstimate; fitsBudget: boolean } {
  if (!Number.isFinite(budgetMiB) || budgetMiB <= 0)
    throw new Error("Budget must be positive.");
  let lo = 1,
    hi = Math.max(1, Math.floor(requested)),
    best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1,
      e = estimateModelMemory({ ...s, contextTokens: mid });
    if (e.estimatedTotalMiB <= budgetMiB) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const contextTokens = best || 1,
    estimate = estimateModelMemory({ ...s, contextTokens });
  return { contextTokens, estimate, fitsBudget: best > 0 };
}
