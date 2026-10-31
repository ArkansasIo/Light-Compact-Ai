import { test } from "node:test";
import assert from "node:assert/strict";
import { VocabularyTokenizer } from "../tokenizer.js";
import {
  trainCompact,
  serializeBundle,
  deserializeBundle,
  reply,
  readCorpus,
} from "../compact/bundle.js";

test("tokenizer splits words and punctuation", () => {
  const tokenizer = new VocabularyTokenizer().fit(["Hello, cat!"]);

  // The first 4 entries are the special tokens <pad>, <unk>, <bos>, <eos>.
  assert.deepEqual(tokenizer.vocabulary.slice(4), ["hello", ",", "cat", "!"]);
  assert.equal(
    tokenizer.decode(tokenizer.encode("hello, cat!")),
    "hello, cat!",
  );
});

test("readCorpus drops blank lines and comments", () => {
  assert.deepEqual(readCorpus("a b\n\n# note\r\n c "), ["a b", "c"]);
});

test("bundle round-trips and gives identical replies", () => {
  const original = trainCompact(["the cat sat", "the dog sat"], {
    epochs: 5,
    dModel: 8,
    numHeads: 2,
    dFeedForward: 16,
    numLayers: 1,
    maxSequenceLength: 8,
  });

  const restored = deserializeBundle(serializeBundle(original));

  assert.equal(restored.tokenizer.vocabSize, original.tokenizer.vocabSize);
  assert.equal(reply(restored, "the cat"), reply(original, "the cat"));
});

test("deserializeBundle rejects unknown formats", () => {
  assert.throws(() =>
    deserializeBundle(JSON.stringify({ format: "other", version: 1 })),
  );
});
