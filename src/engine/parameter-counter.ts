import type { TransformerConfig } from "../model.js";

export interface ParameterBreakdown {
  tokenEmbeddings: number;
  positionEmbeddings: number;
  attention: number;
  feedForward: number;
  normalization: number;
  outputHead: number;
  total: number;
}

/** Counts trainable parameters in the current tied-or-untied architecture.
 * The current TransformerModel uses an untied output head.
 */
export function countTransformerParameters(
  config: TransformerConfig,
): ParameterBreakdown {
  const {
    vocabSize: v,
    maxSequenceLength: s,
    dModel: d,
    dFeedForward: h,
    numLayers: l,
    numHeads,
  } = config;
  for (const [name, value] of Object.entries({
    vocabSize: v,
    maxSequenceLength: s,
    dModel: d,
    dFeedForward: h,
    numLayers: l,
    numHeads,
  })) {
    if (!Number.isInteger(value) || value < 1)
      throw new Error(`${name} must be a positive integer.`);
  }
  if (d % numHeads !== 0)
    throw new Error("dModel must be divisible by numHeads.");
  const tokenEmbeddings = v * d;
  const positionEmbeddings = s * d;
  const attention = l * (4 * d * d + 4 * d);
  const feedForward = l * (2 * d * h + h + d);
  const normalization = l * 4 * d;
  const outputHead = d * v + v;
  return {
    tokenEmbeddings,
    positionEmbeddings,
    attention,
    feedForward,
    normalization,
    outputHead,
    total:
      tokenEmbeddings +
      positionEmbeddings +
      attention +
      feedForward +
      normalization +
      outputHead,
  };
}
