import type { TransformerConfig } from "../model.js";
import { countTransformerParameters } from "./parameter-counter.js";
import type { HardwareProfile } from "./hardware-profiler.js";

export type WeightPrecision = "fp32" | "fp16" | "int8" | "int4";
export interface ModelOption { name: string; config: TransformerConfig; parameters: number; precision: WeightPrecision; estimatedWeightBytes: number; estimatedKvBytes: number; estimatedRuntimeBytes: number; estimatedTotalBytes: number; execution: "cpu" | "gpu" | "distributed-gpu"; fitsAvailableMemory: boolean; }
export interface ModelRecommendationOptions { vocabSize?: number; contextLength?: number; precision?: WeightPrecision; reserveFraction?: number; allowDistributedGpu?: boolean; }
const BITS: Record<WeightPrecision, number> = { fp32: 32, fp16: 16, int8: 8, int4: 4 };

/** Produces several model-size choices using the supplied hardware profile. Estimates are for inference, not training. */
export function recommendModelOptions(profile: HardwareProfile, options: ModelRecommendationOptions = {}): ModelOption[] {
  const vocabSize = options.vocabSize ?? 32000;
  const contextLength = options.contextLength ?? 4096;
  const precision = options.precision ?? (profile.gpus.length ? "fp16" : "fp32");
  const reserveFraction = options.reserveFraction ?? 0.2;
  if (!Number.isInteger(vocabSize) || vocabSize < 2 || !Number.isInteger(contextLength) || contextLength < 1) throw new Error("Invalid vocabulary or context size.");
  if (!(precision in BITS)) throw new Error("Unsupported weight precision.");
  if (!Number.isFinite(reserveFraction) || reserveFraction < 0 || reserveFraction >= 1) throw new Error("reserveFraction must be in [0, 1).");
  const gpuMemory = profile.gpus.reduce((sum, gpu) => sum + Math.max(0, gpu.freeMemoryBytes ?? 0), 0);
  const hostMemory = Math.min(profile.freeRamBytes, profile.totalRamBytes * (1 - reserveFraction));
  const distributed = (options.allowDistributedGpu ?? true) && profile.gpus.length > 1;
  const gpuBudget = distributed ? gpuMemory * (1 - reserveFraction) : Math.max(0, ...profile.gpus.map(gpu => gpu.freeMemoryBytes ?? 0)) * (1 - reserveFraction);
  const useGpu = gpuBudget > 0;
  const budget = useGpu ? gpuBudget : hostMemory;
  const execution = useGpu ? (distributed ? "distributed-gpu" : "gpu") : "cpu";
  const candidates = [
    { name: "Micro", d: 128, layers: 4, heads: 4 },
    { name: "Compact", d: 256, layers: 6, heads: 8 },
    { name: "Small", d: 512, layers: 8, heads: 8 },
    { name: "Medium", d: 768, layers: 12, heads: 12 },
    { name: "Large", d: 1024, layers: 24, heads: 16 },
    { name: "XL", d: 2048, layers: 32, heads: 16 },
    { name: "XXL", d: 4096, layers: 48, heads: 32 }
  ];
  return candidates.map(candidate => {
    const config: TransformerConfig = { vocabSize, maxSequenceLength: contextLength, dModel: candidate.d, numHeads: candidate.heads, dFeedForward: candidate.d * 4, numLayers: candidate.layers, causal: true };
    const parameters = countTransformerParameters(config).total;
    const estimatedWeightBytes = Math.ceil(parameters * BITS[precision] / 8 * (precision === "int4" || precision === "int8" ? 1.12 : 1));
    const estimatedKvBytes = 2 * candidate.layers * contextLength * candidate.d * 2;
    const estimatedRuntimeBytes = Math.ceil((estimatedWeightBytes + estimatedKvBytes) * 0.25);
    const estimatedTotalBytes = estimatedWeightBytes + estimatedKvBytes + estimatedRuntimeBytes;
    return { name: candidate.name, config, parameters, precision, estimatedWeightBytes, estimatedKvBytes, estimatedRuntimeBytes, estimatedTotalBytes, execution, fitsAvailableMemory: estimatedTotalBytes <= budget };
  }).filter(option => option.fitsAvailableMemory).sort((a, b) => a.parameters - b.parameters);
}

export function formatModelOption(option: ModelOption): string {
  const gib = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  return `${option.name}: ${option.parameters.toLocaleString()} parameters, ${option.precision}, ${option.config.maxSequenceLength} context, estimated ${gib(option.estimatedTotalBytes)} inference memory (${option.execution}).`;
}
