/** Reproducible 32-bit PRNG for initialization, sampling and experiment seeds. */
export class SeededRandom {
  private state: number;
  constructor(seed: number) {
    if (!Number.isFinite(seed)) throw new Error("Seed must be finite.");
    this.state = seed >>> 0 || 1;
  }
  nextUint32(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  next(): number {
    return this.nextUint32() / 4294967296;
  }
  integer(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1)
      throw new Error("maxExclusive must be positive.");
    return Math.floor(this.next() * maxExclusive);
  }
  fork(label: string): SeededRandom {
    let h = this.state >>> 0;
    for (let i = 0; i < label.length; i++) {
      h ^= label.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return new SeededRandom(h >>> 0);
  }
}
