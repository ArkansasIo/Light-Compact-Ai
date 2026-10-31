import { Random } from "./random.js";

export type Matrix = number[][];
export type Vector = number[];

export function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => Array<number>(cols).fill(0));
}
export function vectorZeros(n: number): Vector {
  return Array<number>(n).fill(0);
}
export function randomMatrix(
  rows: number,
  cols: number,
  rng: Random,
  scale = 1,
): Matrix {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => rng.normal() * scale),
  );
}
export function cloneMatrix(a: Matrix): Matrix {
  return a.map((r) => [...r]);
}
export function matMul(a: Matrix, b: Matrix): Matrix {
  if (!a.length || !b.length || a[0]!.length !== b.length)
    throw new Error("matMul shape mismatch");
  const out = zeros(a.length, b[0]!.length);
  for (let i = 0; i < a.length; i++)
    for (let k = 0; k < b.length; k++) {
      const aik = a[i]![k]!;
      for (let j = 0; j < b[0]!.length; j++) out[i]![j]! += aik * b[k]![j]!;
    }
  return out;
}
export function transpose(a: Matrix): Matrix {
  if (!a.length) return [];
  return Array.from({ length: a[0]!.length }, (_, j) => a.map((r) => r[j]!));
}
export function add(a: Matrix, b: Matrix): Matrix {
  assertSameShape(a, b);
  return a.map((r, i) => r.map((x, j) => x + b[i]![j]!));
}
export function scale(a: Matrix, s: number): Matrix {
  return a.map((r) => r.map((x) => x * s));
}
export function addInPlace(a: Matrix, b: Matrix): void {
  assertSameShape(a, b);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < a[i]!.length; j++) a[i]![j]! += b[i]![j]!;
}
export function assertSameShape(a: Matrix, b: Matrix): void {
  if (a.length !== b.length || a.some((r, i) => r.length !== b[i]!.length))
    throw new Error("Matrix shape mismatch");
}
export function softmax(x: Vector): Vector {
  const m = Math.max(...x);
  const ex = x.map((v) => Math.exp(v - m));
  const sum = ex.reduce((s, v) => s + v, 0);
  return ex.map((v) => v / sum);
}
export function gelu(x: number): number {
  const c = Math.sqrt(2 / Math.PI);
  return 0.5 * x * (1 + Math.tanh(c * (x + 0.044715 * x ** 3)));
}
export function geluDerivative(x: number): number {
  const c = Math.sqrt(2 / Math.PI),
    u = c * (x + 0.044715 * x ** 3),
    t = Math.tanh(u);
  return 0.5 * (1 + t) + 0.5 * x * (1 - t * t) * c * (1 + 3 * 0.044715 * x * x);
}
export function layerNorm(
  x: Matrix,
  gamma: Vector,
  beta: Vector,
  eps = 1e-5,
): Matrix {
  return x.map((row) => {
    const mean = row.reduce((s, v) => s + v, 0) / row.length;
    const variance = row.reduce((s, v) => s + (v - mean) ** 2, 0) / row.length;
    const inv = 1 / Math.sqrt(variance + eps);
    return row.map((v, j) => (v - mean) * inv * gamma[j]! + beta[j]!);
  });
}
/** Backward for per-row layer norm. */
export function layerNormBackward(
  x: Matrix,
  dy: Matrix,
  gamma: Vector,
  eps = 1e-5,
): { dx: Matrix; dGamma: Vector; dBeta: Vector } {
  const dx = zeros(x.length, x[0]!.length),
    dGamma = vectorZeros(gamma.length),
    dBeta = vectorZeros(gamma.length);
  for (let i = 0; i < x.length; i++) {
    const row = x[i]!,
      grad = dy[i]!,
      n = row.length;
    const mean = row.reduce((s, v) => s + v, 0) / n,
      variance = row.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const inv = 1 / Math.sqrt(variance + eps),
      norm = row.map((v) => (v - mean) * inv);
    let sum1 = 0,
      sum2 = 0;
    for (let j = 0; j < n; j++) {
      const g = grad[j]! * gamma[j]!;
      sum1 += g;
      sum2 += g * norm[j]!;
      dGamma[j]! += grad[j]! * norm[j]!;
      dBeta[j]! += grad[j]!;
    }
    for (let j = 0; j < n; j++)
      dx[i]![j] =
        (inv / n) * (n * grad[j]! * gamma[j]! - sum1 - norm[j]! * sum2);
  }
  return { dx, dGamma, dBeta };
}
export function crossEntropy(
  logits: Matrix,
  targets: number[],
  ignoreIndex = -100,
): { loss: number; gradient: Matrix; count: number } {
  if (logits.length !== targets.length)
    throw new Error("Target/logit length mismatch");
  const grad = zeros(logits.length, logits[0]!.length);
  let loss = 0,
    count = 0;
  for (let i = 0; i < logits.length; i++) {
    const target = targets[i]!;
    if (target === ignoreIndex) continue;
    if (target < 0 || target >= logits[i]!.length)
      throw new Error(`Target id out of range: ${target}`);
    const p = softmax(logits[i]!);
    loss -= Math.log(Math.max(p[target]!, 1e-12));
    count++;
    for (let j = 0; j < p.length; j++) grad[i]![j] = p[j]!;
    grad[i]![target]! -= 1;
  }
  if (!count) throw new Error("Batch contains no valid target tokens");
  return { loss: loss / count, gradient: scale(grad, 1 / count), count };
}
