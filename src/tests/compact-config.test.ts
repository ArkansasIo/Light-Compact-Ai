import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_COMPACT_CONFIG,
  loadCompactConfig,
  mergeCompactConfig,
  validateCompactConfig,
  type PartialCompactConfig,
} from "../config/compact-config.js";

test("environment variables override config values", () => {
  const config = loadCompactConfig({
    PORT: "4000",
    EPOCHS: "3",
    MODEL_PATH: "tmp/m.json",
  });
  assert.equal(config.server.port, 4000);
  assert.equal(config.training.epochs, 3);
  assert.equal(config.training.output, "tmp/m.json");
});

test("merge keeps unspecified fields", () => {
  const merged = mergeCompactConfig(DEFAULT_COMPACT_CONFIG, {
    model: { numLayers: 4 },
  });
  assert.equal(merged.model.numLayers, 4);
  assert.equal(merged.model.dModel, DEFAULT_COMPACT_CONFIG.model.dModel);
});

test("validation rejects bad values", () => {
  const bad = (patch: PartialCompactConfig) => () =>
    validateCompactConfig(mergeCompactConfig(DEFAULT_COMPACT_CONFIG, patch));
  assert.throws(bad({ model: { dModel: 30, numHeads: 4 } }), /divisible/);
  assert.throws(bad({ training: { epochs: 0 } }), /training\.epochs/);
  assert.throws(bad({ server: { port: 70000 } }), /server\.port/);
  assert.throws(() => loadCompactConfig({ EPOCHS: "abc" }), /training\.epochs/);
});

test("missing LCAI_CONFIG file is an error", () => {
  assert.throws(
    () => loadCompactConfig({ LCAI_CONFIG: "does-not-exist.json" }),
    /not found/,
  );
});
