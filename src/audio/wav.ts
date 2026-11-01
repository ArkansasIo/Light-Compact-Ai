/** 16-bit PCM WAV encoding. */
import type { AudioResult } from "./types.js";

export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
): Buffer {
  if (channels.length === 0)
    throw new Error("encodeWav needs at least one channel");
  const frames = channels[0]!.length;
  if (channels.some((c) => c.length !== frames)) {
    throw new Error("all channels must have the same length");
  }
  const count = channels.length;
  const dataBytes = frames * count * 2;
  const out = Buffer.alloc(44 + dataBytes);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16); // fmt chunk size
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(count, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * count * 2, 28); // byte rate
  out.writeUInt16LE(count * 2, 32); // block align
  out.writeUInt16LE(16, 34); // bits per sample
  out.write("data", 36, "ascii");
  out.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i]!));
      out.writeInt16LE(Math.round(s * 32767), offset);
      offset += 2;
    }
  }
  return out;
}

export function toAudioResult(
  channels: Float32Array[],
  sampleRate: number,
): AudioResult {
  const frames = channels[0]?.length ?? 0;
  return {
    format: "wav",
    sampleRate,
    channels: channels.length,
    durationMs: Math.round((frames / sampleRate) * 1000),
    data: encodeWav(channels, sampleRate),
  };
}
