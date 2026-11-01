/**
 * Standard MIDI File (format 1) export. MIDI carries notes, not sound: open
 * the file in any DAW or player with a SoundFont to hear it with other instruments.
 */
import type { NoteEvent } from "../audio/types.js";
import { PPQ } from "../audio/transport.js";

export interface MidiTrackInput {
  name: string;
  /** General MIDI program (0-127). */
  program: number;
  /** 0-15; channel 9 is drums. */
  channel: number;
  notes: NoteEvent[];
  /** Write each note's lyricSyllable as a lyric event. */
  lyrics?: boolean;
}

export interface MidiOptions {
  tempo: number;
  beatsPerBar: number;
  title: string;
}

function vlq(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

const text = (s: string) => [...Buffer.from(s, "utf8")];

function meta(type: number, data: number[]): number[] {
  return [0xff, type, ...vlq(data.length), ...data];
}

function chunk(id: string, data: number[]): number[] {
  const len = data.length;
  return [
    ...text(id),
    (len >>> 24) & 0xff,
    (len >>> 16) & 0xff,
    (len >>> 8) & 0xff,
    len & 0xff,
    ...data,
  ];
}

interface TimedEvent {
  tick: number;
  /** Lower first at the same tick: note-offs, then lyrics, then note-ons. */
  order: number;
  bytes: number[];
}

function trackBytes(events: TimedEvent[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out: number[] = [];
  let last = 0;
  for (const e of events) {
    out.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  out.push(0, ...meta(0x2f, []));
  return out;
}

export function writeMidi(
  tracks: MidiTrackInput[],
  options: MidiOptions,
): Buffer {
  const ticks = (beats: number) => Math.round(beats * PPQ);
  const usPerBeat = Math.round(60_000_000 / options.tempo);

  const conductor = trackBytes([
    { tick: 0, order: 0, bytes: meta(0x03, text(options.title)) },
    {
      tick: 0,
      order: 1,
      bytes: meta(0x51, [
        (usPerBeat >> 16) & 0xff,
        (usPerBeat >> 8) & 0xff,
        usPerBeat & 0xff,
      ]),
    },
    // numerator, denominator as a power of two (2 = quarter), clocks per click, 32nds per quarter
    { tick: 0, order: 2, bytes: meta(0x58, [options.beatsPerBar, 2, 24, 8]) },
  ]);

  const chunks = [chunk("MTrk", conductor)];
  for (const track of tracks) {
    const ch = track.channel & 0x0f;
    const events: TimedEvent[] = [
      { tick: 0, order: -2, bytes: meta(0x03, text(track.name)) },
      { tick: 0, order: -1, bytes: [0xc0 | ch, track.program & 0x7f] },
    ];
    for (const n of track.notes) {
      const pitch = Math.max(0, Math.min(127, Math.round(n.pitch)));
      const velocity = Math.max(1, Math.min(127, Math.round(n.velocity ?? 80)));
      const on = ticks(n.startBeats);
      const off = Math.max(on + 1, ticks(n.startBeats + n.durationBeats));
      if (track.lyrics && n.lyricSyllable)
        events.push({
          tick: on,
          order: 1,
          bytes: meta(0x05, text(n.lyricSyllable)),
        });
      events.push({ tick: on, order: 2, bytes: [0x90 | ch, pitch, velocity] });
      events.push({ tick: off, order: 0, bytes: [0x80 | ch, pitch, 0] });
    }
    chunks.push(chunk("MTrk", trackBytes(events)));
  }

  const header = chunk("MThd", [
    0,
    1,
    (chunks.length >> 8) & 0xff,
    chunks.length & 0xff,
    (PPQ >> 8) & 0xff,
    PPQ & 0xff,
  ]);
  return Buffer.from([...header, ...chunks.flat()]);
}
