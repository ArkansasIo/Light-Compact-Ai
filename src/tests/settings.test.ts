import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_SETTINGS,
  adjustSetting,
  loadSettings,
  normalizeSettings,
  saveSettings,
  toSamplingOptions,
} from "../settings/user-settings.js";
import { trainCompact, reply } from "../compact/bundle.js";

test("adjustSetting steps numbers, clamps, and wraps choices", () => {
  let s = adjustSetting(DEFAULT_SETTINGS, "temperature", 1);
  s = adjustSetting(s, "temperature", 1);
  s = adjustSetting(s, "temperature", 1);
  assert.equal(s.temperature, 0.3);
  assert.equal(
    adjustSetting(DEFAULT_SETTINGS, "temperature", -1).temperature,
    0,
  );
  assert.equal(
    adjustSetting(DEFAULT_SETTINGS, "showStats", 1).showStats,
    false,
  );
  assert.equal(adjustSetting(DEFAULT_SETTINGS, "theme", -1).theme, "mono");
});

test("normalizeSettings ignores unknown keys and bad values", () => {
  const s = normalizeSettings({
    temperature: "5",
    topK: "abc",
    theme: "pink",
    extra: 1,
    showStats: "off",
  });
  assert.equal(s.temperature, 2);
  assert.equal(s.topK, DEFAULT_SETTINGS.topK);
  assert.equal(s.theme, DEFAULT_SETTINGS.theme);
  assert.equal(s.showStats, false);
  assert.equal("extra" in s, false);
});

test("settings save and load round-trip; broken files throw", () => {
  const dir = mkdtempSync(join(tmpdir(), "lcai-"));
  try {
    const path = join(dir, "nested", "settings.json");
    assert.deepEqual(loadSettings(path), DEFAULT_SETTINGS);
    const changed = {
      ...DEFAULT_SETTINGS,
      maxTokens: 40,
      theme: "blue" as const,
    };
    saveSettings(changed, path);
    assert.deepEqual(loadSettings(path), changed);
    writeFileSync(path, "{not json");
    assert.throws(() => loadSettings(path), /could not parse/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("temperature 0 is greedy; sampling with a seed is reproducible", () => {
  assert.equal(toSamplingOptions(DEFAULT_SETTINGS), undefined);
  const bundle = trainCompact(["the cat sat", "the dog sat"], {
    epochs: 3,
    dModel: 8,
    numHeads: 2,
    dFeedForward: 16,
    numLayers: 1,
    maxSequenceLength: 8,
  });
  const sampling = {
    ...toSamplingOptions({ ...DEFAULT_SETTINGS, temperature: 1.2 })!,
    seed: 42,
  };
  assert.equal(
    reply(bundle, "the", 6, sampling),
    reply(bundle, "the", 6, sampling),
  );
});
