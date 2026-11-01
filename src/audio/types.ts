/**
 * Shared contracts for speech, singing, music and audio.
 * Musical time is always in beats; the Transport maps beats to samples.
 */

/** One note on the musical timeline. */
export interface NoteEvent {
  /** MIDI pitch, 60 = middle C. For drums, the General MIDI drum number. */
  pitch: number;
  startBeats: number;
  durationBeats: number;
  /** 1..127, default 80. */
  velocity?: number;
  /** The syllable sung on this note (vocal tracks). */
  lyricSyllable?: string;
}

export interface AudioResult {
  format: "wav" | "mp3";
  sampleRate: number;
  channels: number;
  durationMs: number;
  data: Uint8Array;
}
