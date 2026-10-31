/** Deterministic PRNG and Gaussian initialization. */
export class Random {
  private state: number;
  private spare: number | null = null;
  constructor(seed = 123456789) {
    this.state = seed >>> 0 || 1;
  }
  uniform(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  normal(): number {
    if (this.spare !== null) {
      const x = this.spare;
      this.spare = null;
      return x;
    }
    let u = 0,
      v = 0;
    while (u === 0) u = this.uniform();
    while (v === 0) v = this.uniform();
    const mag = Math.sqrt(-2 * Math.log(u));
    this.spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  }
}
