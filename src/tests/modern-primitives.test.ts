import test from "node:test";
import assert from "node:assert/strict";
import { BpeTokenizer } from "../tokenizer/bpe-tokenizer.js";
import { applyRotaryPositionEmbedding } from "../nn/rope.js";
import { rmsNorm, rmsNormBackward } from "../nn/rms-norm.js";
import { swiglu, swigluBackward } from "../nn/swiglu.js";
import { KVCache } from "../engine/kv-cache.js";
import { sampleLogits } from "../engine/sampling.js";
import { GroupedQueryAttention } from "../nn/grouped-query-attention.js";
import { ParameterStore } from "../core/parameters.js";
import { Random } from "../core/random.js";
test("byte BPE round trips UTF-8 and serializes merges", () => {
  const t = new BpeTokenizer(300).train(["hello hello", "hello world", "café"]);
  const ids = t.encode("hello café", true, true);
  assert.equal(t.decode(ids), "hello café");
  const t2 = new BpeTokenizer(300);
  t2.load(t.state());
  assert.deepEqual(t2.encode("hello café", true, true), ids);
});
test("RoPE preserves shape and rotates values", () => {
  const x = [
    [1, 0, 0, 1],
    [1, 0, 0, 1],
  ];
  const y = applyRotaryPositionEmbedding(x, 2);
  assert.deepEqual(
    y.map((r) => r.length),
    [4, 4],
  );
  assert.equal(y[0]![0], 1);
  assert.notEqual(y[1]![0], 1);
});
test("RMSNorm returns finite values and gradients", () => {
  const x = [[1, 2, 3]],
    w = [1, 1, 1],
    y = rmsNorm(x, w),
    g = rmsNormBackward(x, [[1, 1, 1]], w);
  assert.ok(y.flat().every(Number.isFinite));
  assert.ok(g.dx.flat().every(Number.isFinite));
});
test("SwiGLU forward and backward are finite", () => {
  const r = swiglu([[1, -1]], [[2, 3]]),
    g = swigluBackward(r.cache, [[1, 1]]);
  assert.ok(r.output.flat().every(Number.isFinite));
  assert.ok(g.dGate.flat().every(Number.isFinite));
});
test("KV cache appends and enforces capacity", () => {
  const c = new KVCache(3);
  c.append(0, [[1, 2]], [[3, 4]]);
  c.append(0, [[5, 6]], [[7, 8]]);
  assert.equal(c.get(0)!.keys.length, 2);
  assert.throws(() =>
    c.append(
      0,
      [
        [1, 2],
        [3, 4],
      ],
      [
        [1, 2],
        [3, 4],
      ],
    ),
  );
});
test("sampling is deterministic with explicit seed and greedy at zero temperature", () => {
  assert.equal(sampleLogits([0, 3, 1], { temperature: 0 }), 1);
  assert.equal(
    sampleLogits([0, 3, 1], { seed: 77 }),
    sampleLogits([0, 3, 1], { seed: 77 }),
  );
});
test("GQA maps query heads to fewer KV heads", () => {
  const store = new ParameterStore(),
    g = new GroupedQueryAttention(store, "gqa", 8, 4, 2, new Random(9)),
    y = g.forward([
      [1, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 0, 0, 0],
    ]);
  assert.equal(y.length, 2);
  assert.equal(y[0]!.length, 8);
  assert.ok(y.flat().every(Number.isFinite));
});
