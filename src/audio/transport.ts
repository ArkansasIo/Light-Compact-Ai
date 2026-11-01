/**
 * The shared musical clock. Every track (vocals, instruments, MIDI) is placed
 * in beats and converted to samples here, so parts stay in sync by
 * construction instead of by comparing wall-clock timestamps.
 *
 * Limitation: one tempo and one meter per song (no tempo changes yet).
 */
export interface TimeSignature {
  beatsPerBar: number;
  /** Note value of one beat: 4 = quarter note. */
  beatUnit: number;
}

/** MIDI ticks per quarter note. */
export const PPQ = 480;

export class Transport {
  constructor(
    readonly tempo: number,
    readonly sampleRate: number,
    readonly meter: TimeSignature = { beatsPerBar: 4, beatUnit: 4 },
  ) {
    if (!Number.isFinite(tempo) || tempo < 20 || tempo > 300) {
      throw new Error(`tempo must be 20..300 bpm (got ${tempo}).`);
    }
    if (
      !Number.isInteger(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000
    ) {
      throw new Error(
        `sample rate must be 8000..192000 Hz (got ${sampleRate}).`,
      );
    }
    if (
      !Number.isInteger(meter.beatsPerBar) ||
      meter.beatsPerBar < 1 ||
      meter.beatsPerBar > 12
    ) {
      throw new Error(
        `beats per bar must be 1..12 (got ${meter.beatsPerBar}).`,
      );
    }
  }

  get secondsPerBeat(): number {
    return 60 / this.tempo;
  }

  beatsToSeconds(beats: number): number {
    return beats * this.secondsPerBeat;
  }

  beatsToSamples(beats: number): number {
    return Math.round(this.beatsToSeconds(beats) * this.sampleRate);
  }

  samplesToBeats(samples: number): number {
    return samples / this.sampleRate / this.secondsPerBeat;
  }

  barsToBeats(bars: number): number {
    return bars * this.meter.beatsPerBar;
  }

  beatsToTicks(beats: number): number {
    return Math.round(beats * PPQ);
  }
}
