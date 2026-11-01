/**
 * Chat with a trained compact model.
 *
 * Usage:
 *   npm run chat
 *   node dist/cli/chat.js [model.checkpoint.json]
 *
 * In a terminal this opens the interactive UI (src/tui/app.ts).
 * With piped input it reads one prompt per line and prints one reply per line.
 */
import { createInterface } from "node:readline";
import { loadBundle, reply } from "../compact/bundle.js";
import { loadCompactConfig } from "../config/compact-config.js";
import { loadDotEnv } from "../config/env.js";
import { loadVoiceConfig } from "../voice/voice.js";
import { loadVoiceProfiles } from "../profiles/voices.js";
import { ChatApp } from "../tui/app.js";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SETTINGS_PATH,
  loadSettings,
  toSamplingOptions,
} from "../settings/user-settings.js";

loadDotEnv();
const config = loadCompactConfig();
const voice = loadVoiceConfig();
const modelPath = process.argv[2] ?? config.training.output;
const bundle = loadBundle(modelPath);

// User settings (/settings in the UI) start from the config's reply length.
const settingsPath = process.env.LCAI_SETTINGS ?? DEFAULT_SETTINGS_PATH;
const settings = loadSettings(settingsPath, {
  ...DEFAULT_SETTINGS,
  maxTokens: config.generation.maxTokens,
  voiceProvider: voice.provider,
});

if (process.stdin.isTTY && process.stdout.isTTY) {
  new ChatApp({
    config,
    modelPath,
    bundle,
    settings,
    settingsPath,
    voice,
    profiles: loadVoiceProfiles(),
  }).start();
} else {
  await runPlain();
}

/** Line-by-line mode for scripts and pipes. */
async function runPlain(): Promise<void> {
  if (!bundle) {
    console.error(`no model at ${modelPath}. run "npm run train" first.`);
    process.exit(1);
  }
  // Terminals like Git Bash (mintty) are not detected as TTYs, so without
  // this hint the chat looks frozen. Written to stderr to keep stdout clean.
  console.error(
    "Plain mode (no interactive terminal detected). Type a prompt and press Enter; type exit to quit.\n" +
      "For the full UI, run in PowerShell, cmd, Windows Terminal, or use: winpty npm.cmd run chat",
  );
  const rl = createInterface({ input: process.stdin });
  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (/^\/?(exit|quit)$/i.test(line)) break;
    if (line)
      console.log(
        reply(bundle, line, settings.maxTokens, toSamplingOptions(settings)) ||
          "(no output)",
      );
  }
  rl.close();
}
