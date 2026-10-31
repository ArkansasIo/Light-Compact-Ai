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
import { ChatApp } from "../tui/app.js";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SETTINGS_PATH,
  loadSettings,
  toSamplingOptions,
} from "../settings/user-settings.js";

const config = loadCompactConfig();
const modelPath = process.argv[2] ?? config.training.output;
const bundle = loadBundle(modelPath);

// User settings (/settings in the UI) start from the config's reply length.
const settingsPath = process.env.LCAI_SETTINGS ?? DEFAULT_SETTINGS_PATH;
const settings = loadSettings(settingsPath, {
  ...DEFAULT_SETTINGS,
  maxTokens: config.generation.maxTokens,
});

if (process.stdin.isTTY && process.stdout.isTTY) {
  new ChatApp({ config, modelPath, bundle, settings, settingsPath }).start();
} else {
  await runPlain();
}

/** Line-by-line mode for scripts and pipes. */
async function runPlain(): Promise<void> {
  if (!bundle) {
    console.error(`no model at ${modelPath}. run "npm run train" first.`);
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin });
  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (line === "exit" || line === "quit") break;
    if (line)
      console.log(
        reply(bundle, line, settings.maxTokens, toSamplingOptions(settings)) ||
          "(no output)",
      );
  }
  rl.close();
}
