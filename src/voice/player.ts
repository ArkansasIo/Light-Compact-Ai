/**
 * Play audio through the system's speakers.
 *
 *   Windows  PowerShell + WPF MediaPlayer (built in)
 *   macOS    afplay (built in)
 *   Linux    the first of ffplay, mpg123, mpv that is installed
 *
 * Set LCAI_AUDIO_PLAYER to use another command; the audio file path is
 * appended as the last argument, e.g. LCAI_AUDIO_PLAYER="vlc --intf dummy --play-and-exit".
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Command = [string, string[]];

function windowsCommand(file: string): Command {
  const path = file.replace(/'/g, "''");
  const script = [
    "Add-Type -AssemblyName PresentationCore",
    "$p = New-Object System.Windows.Media.MediaPlayer",
    `$p.Open([Uri]'${path}')`,
    "$i = 0; while (-not $p.NaturalDuration.HasTimeSpan -and $i -lt 100) { Start-Sleep -Milliseconds 50; $i++ }",
    "$p.Play()",
    "if ($p.NaturalDuration.HasTimeSpan) { Start-Sleep -Milliseconds ([int]$p.NaturalDuration.TimeSpan.TotalMilliseconds + 300) } else { Start-Sleep -Seconds 15 }",
    "$p.Close()",
  ].join("; ");
  return [
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
  ];
}

/** Candidate commands for this platform, best first. */
export function playerCommands(
  file: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): Command[] {
  const custom = env.LCAI_AUDIO_PLAYER?.trim();
  if (custom) {
    const [cmd, ...args] = custom.split(/\s+/);
    return [[cmd!, [...args, file]]];
  }
  if (platform === "win32") return [windowsCommand(file)];
  if (platform === "darwin") return [["afplay", [file]]];
  return [
    ["ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", file]],
    ["mpg123", ["-q", file]],
    ["mpv", ["--no-video", "--really-quiet", file]],
  ];
}

function run(
  cmd: string,
  args: string[],
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore", windowsHide: true });
    onSpawn(child);
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0 || signal) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

/** Plays one clip at a time; starting a new clip or calling stop() cuts off the old one. */
export class AudioPlayer {
  private current: ChildProcess | undefined;

  get playing(): boolean {
    return this.current !== undefined;
  }

  stop(): void {
    this.current?.kill();
    this.current = undefined;
  }

  /** Resolves when playback ends (or is stopped). */
  async play(audio: Buffer, extension = "mp3"): Promise<void> {
    this.stop();
    const file = join(tmpdir(), `lcai-voice-${randomUUID()}.${extension}`);
    writeFileSync(file, audio);
    try {
      const failures: string[] = [];
      for (const [cmd, args] of playerCommands(file)) {
        try {
          await run(cmd, args, (child) => (this.current = child));
          return;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          failures.push(
            code === "ENOENT" ? `${cmd} not found` : (err as Error).message,
          );
          if (code !== "ENOENT") break; // the player exists but failed; don't try others
        }
      }
      throw new Error(
        `could not play audio (${failures.join("; ")}). Install ffplay/mpg123/mpv or set LCAI_AUDIO_PLAYER.`,
      );
    } finally {
      this.current = undefined;
      rmSync(file, { force: true });
    }
  }
}
