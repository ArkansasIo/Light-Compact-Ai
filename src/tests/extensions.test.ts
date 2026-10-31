import test from "node:test";
import assert from "node:assert/strict";
import { Tensor } from "../engine/tensor.js";
import {
  sortValues,
  sortTensorAxis,
  reduceTensorAxis,
  topK,
} from "../algorithms/multidimensional.js";
import { SevenNodeSystem } from "../cluster/seven-node-system.js";
import {
  downsampleSequence,
  upsampleSequence,
} from "../engine/zipformer-multiresolution.js";
import { estimateModelMemory } from "../engine/memory-estimator.js";
import { EncoderDecoderTransformer } from "../encoder-decoder.js";
test("multidimensional algorithms sort, reduce and rank", () => {
  assert.deepEqual(sortValues([4, 1, 3, 2]), [1, 2, 3, 4]);
  const t = new Tensor([4, 1, 3, 2], [2, 2]);
  assert.deepEqual(Array.from(sortTensorAxis(t, 0).data), [3, 1, 4, 2]);
  assert.deepEqual(Array.from(reduceTensorAxis(t, 1, "sum").data), [5, 5]);
  assert.equal(topK([1, 9, 3], 1)[0]!.value, 9);
});
test("seven logical nodes execute dependency graphs", async () => {
  const s = new SevenNodeSystem(3);
  const r = await s.executeGraph([
    { id: "a", run: () => 2 },
    { id: "b", dependsOn: ["a"], run: () => 3 },
    { id: "c", dependsOn: ["a"], run: () => 4 },
  ]);
  assert.equal(r.get("b"), 3);
  assert.equal(r.get("c"), 4);
});
test("multiresolution temporal path preserves requested sequence length", () => {
  const t = new Tensor(
    Array.from({ length: 24 }, (_, i) => i),
    [1, 6, 4],
  );
  const d = downsampleSequence(t, 2),
    u = upsampleSequence(d, 6);
  assert.deepEqual(u.shape, [1, 6, 4]);
});
test("memory estimate is finite and positive", () => {
  const e = estimateModelMemory({
    parameters: 1000000,
    format: "q4",
    layers: 4,
    kvHeads: 2,
    headDimension: 16,
    contextTokens: 1024,
  });
  assert.ok(e.estimatedTotalMiB > 0);
});
test("encoder-decoder returns target-position vocabulary logits", () => {
  const m = new EncoderDecoderTransformer({
    vocabSize: 16,
    maxSourceLength: 8,
    maxTargetLength: 8,
    dModel: 8,
    numHeads: 2,
    dFeedForward: 16,
    encoderLayers: 1,
    decoderLayers: 1,
    seed: 5,
  });
  const y = m.forward([1, 2, 3], [1, 4]);
  assert.equal(y.length, 2);
  assert.equal(y[0]!.length, 16);
  assert.ok(y.flat().every(Number.isFinite));
});
