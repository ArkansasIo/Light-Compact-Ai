/**
 * Compose, sing and play an original song from a prompt.
 *
 * Usage:
 *   npm run sing -- "a gentle, original fairytale song"
 *   npm run sing -- "a happy celtic song about the sea" --voice ethereal-elven-princess
 *   npm run sing -- "an epic duet" --voice bright-tenor,fairytale-soprano --full
 *   npm run sing -- --lyrics my-lyrics.txt "a jazz ballad"
 *   npm run sing -- --load songs/<name>/song.json      (re-render a saved song)
 *   npm run sing -- --list                             (styles and voices)
 *
 * Options: --style <name> --key "<D major>" --tempo <bpm> --meter <3|4> --seed <n>
 *          --voice <id[,id]> --lyrics <file> --full --out <dir> --stems --no-play
 */
import { readFileSync } from "node:fs";
import { encodeWav } from "../audio/wav.js";
import { STYLE_NAMES, STYLES } from "../music/composer.js";
import {
  createSong,
  describeSong,
  loadSong,
  renderSong,
  saveSong,
  type Song,
  type SongRequest,
} from "../musical-mode/song.js";
import { loadVoiceProfiles } from "../profiles/voices.js";
import { AudioPlayer } from "../voice/player.js";

interface Args {
  prompt: string[];
  flags: Map<string, string | true>;
}

const VALUE_FLAGS = new Set([
  "style",
  "key",
  "tempo",
  "meter",
  "seed",
  "voice",
  "lyrics",
  "out",
  "load",
]);

function parseArgs(argv: string[]): Args {
  const prompt: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      prompt.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split("=", 2) as [
      string,
      string | undefined,
    ];
    if (VALUE_FLAGS.has(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined) throw new Error(`--${name} needs a value`);
      flags.set(name, value);
    } else {
      flags.set(name, true);
    }
  }
  return { prompt, flags };
}

function num(flags: Args["flags"], name: string): number | undefined {
  const v = flags.get(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (typeof v !== "string" || !Number.isFinite(n))
    throw new Error(`--${name} must be a number`);
  return n;
}

async function main(): Promise<void> {
  const { prompt, flags } = parseArgs(process.argv.slice(2));
  const profiles = loadVoiceProfiles();

  if (flags.has("list") || flags.has("help")) {
    console.log("Styles:");
    for (const name of STYLE_NAMES)
      console.log(`  ${name.padEnd(16)} ${STYLES[name].label}`);
    console.log("\nVoices:");
    for (const p of profiles)
      console.log(`  ${p.id.padEnd(24)} ${p.name}: ${p.description}`);
    console.log(
      '\nExample: npm run sing -- "a gentle fairytale song" --voice aurora',
    );
    return;
  }

  let song: Song;
  const load = flags.get("load");
  if (typeof load === "string") {
    song = loadSong(load);
  } else {
    const lyricsFile = flags.get("lyrics");
    const voice = flags.get("voice");
    const style = flags.get("style");
    const key = flags.get("key");
    const tempo = num(flags, "tempo");
    const meter = num(flags, "meter");
    const seed = num(flags, "seed");
    const request: SongRequest = {
      // npm on Windows can leave cmd.exe "^" escapes in arguments; drop them.
      prompt:
        prompt.join(" ").replace(/\^/g, "").trim() ||
        "a gentle, original fairytale song",
      ...(typeof style === "string" ? { style } : {}),
      ...(typeof key === "string" ? { key } : {}),
      ...(tempo !== undefined ? { tempo } : {}),
      ...(meter !== undefined ? { meter } : {}),
      ...(seed !== undefined ? { seed } : {}),
      ...(typeof voice === "string"
        ? {
            voices: voice
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          }
        : {}),
      ...(typeof lyricsFile === "string"
        ? { lyrics: readFileSync(lyricsFile, "utf8") }
        : {}),
      ...(flags.has("full") ? { form: "full" as const } : {}),
    };
    song = createSong(request, profiles);
  }

  console.log(`\n♪ ${song.title}`);
  for (const line of describeSong(song, profiles)) console.log(`  ${line}`);
  for (const section of song.lyrics) {
    console.log(`\n  [${section.kind}]`);
    for (const line of section.lines) console.log(`  ${line}`);
  }
  console.log("");

  const started = Date.now();
  const rendered = await renderSong(song, {
    profiles,
    onProgress: (done, total, track) =>
      process.stderr.write(
        `\r  rendering ${Math.min(done + 1, total)}/${total}: ${track}`.padEnd(
          60,
        ),
      ),
  });
  process.stderr.write("\r".padEnd(61) + "\r");
  const outFlag = flags.get("out");
  const saved = saveSong(
    song,
    rendered,
    typeof outFlag === "string" ? outFlag : undefined,
    { stems: flags.has("stems") },
  );

  console.log(
    `  rendered ${rendered.durationSec.toFixed(1)}s of audio in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  console.log(
    `  vocals: ${rendered.singer}. This is a guide vocal, not natural singing.`,
  );
  console.log(`  saved to ${saved.dir}`);
  console.log("    song.json  arrangement (re-render with --load)");
  console.log(
    "    song.mid   MIDI with lyrics (open in any DAW or SoundFont player)",
  );
  console.log(
    `    mix.wav, vocals.wav, accompaniment.wav${saved.stems.length ? `, ${saved.stems.length} stems` : ""}`,
  );

  if (flags.has("no-play")) return;
  console.log("\n  playing… (Ctrl+C to stop)");
  const player = new AudioPlayer();
  process.on("SIGINT", () => {
    player.stop();
    process.exit(130);
  });
  await player.play(encodeWav(rendered.mix, rendered.sampleRate), "wav");
}

main().catch((err: unknown) => {
  console.error(`sing: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
