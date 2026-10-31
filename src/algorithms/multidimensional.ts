import { Tensor } from "../engine/tensor.js";
export type SortAlgorithm = "quick" | "merge" | "heap" | "insertion";
type Compare = (a: number, b: number) => number;
export function sortValues(
  values: ArrayLike<number>,
  algorithm: SortAlgorithm = "quick",
  descending = false,
): number[] {
  const a = Array.from(values),
    cmp: Compare = descending ? (x, y) => y - x : (x, y) => x - y;
  if (algorithm === "insertion") {
    for (let i = 1; i < a.length; i++) {
      const v = a[i]!;
      let j = i - 1;
      while (j >= 0 && cmp(a[j]!, v) > 0) {
        a[j + 1] = a[j]!;
        j--;
      }
      a[j + 1] = v;
    }
    return a;
  }
  if (algorithm === "merge") {
    const merge = (v: number[]): number[] => {
      if (v.length < 2) return v;
      const m = v.length >> 1,
        l = merge(v.slice(0, m)),
        r = merge(v.slice(m)),
        o: number[] = [];
      let i = 0,
        j = 0;
      while (i < l.length && j < r.length)
        o.push(cmp(l[i]!, r[j]!) <= 0 ? l[i++]! : r[j++]!);
      return o.concat(l.slice(i), r.slice(j));
    };
    return merge(a);
  }
  if (algorithm === "heap") {
    const n = a.length,
      sift = (size: number, root: number) => {
        let p = root;
        for (;;) {
          let c = 2 * p + 1;
          if (c >= size) return;
          if (c + 1 < size && cmp(a[c]!, a[c + 1]!) < 0) c++;
          if (cmp(a[p]!, a[c]!) >= 0) return;
          [a[p], a[c]] = [a[c]!, a[p]!];
          p = c;
        }
      };
    for (let i = (n >> 1) - 1; i >= 0; i--) sift(n, i);
    for (let e = n - 1; e > 0; e--) {
      [a[0], a[e]] = [a[e]!, a[0]!];
      sift(e, 0);
    }
    return a;
  }
  const stack: Array<[number, number]> = [[0, a.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    if (lo >= hi) continue;
    const pivot = a[(lo + hi) >> 1]!;
    let i = lo,
      j = hi;
    while (i <= j) {
      while (cmp(a[i]!, pivot) < 0) i++;
      while (cmp(a[j]!, pivot) > 0) j--;
      if (i <= j) {
        [a[i], a[j]] = [a[j]!, a[i]!];
        i++;
        j--;
      }
    }
    if (lo < j) stack.push([lo, j]);
    if (i < hi) stack.push([i, hi]);
  }
  return a;
}
function axisLayout(t: Tensor, axis: number) {
  if (!Number.isInteger(axis) || axis < 0 || axis >= t.rank)
    throw new RangeError("Invalid tensor axis.");
  const n = t.shape[axis]!,
    outer = t.shape.slice(0, axis).reduce((a, b) => a * b, 1),
    inner = t.shape.slice(axis + 1).reduce((a, b) => a * b, 1);
  return { n, outer, inner };
}
export function sortTensorAxis(
  t: Tensor,
  axis: number,
  algorithm: SortAlgorithm = "quick",
  descending = false,
): Tensor {
  const { n, outer, inner } = axisLayout(t, axis),
    out = Tensor.zeros(t.shape);
  for (let o = 0; o < outer; o++)
    for (let i = 0; i < inner; i++) {
      const lane = Array.from(
        { length: n },
        (_, k) => t.data[o * n * inner + k * inner + i]!,
      );
      const sorted = sortValues(lane, algorithm, descending);
      for (let k = 0; k < n; k++)
        out.data[o * n * inner + k * inner + i] = sorted[k]!;
    }
  return out;
}
export function argsortTensorAxis(
  t: Tensor,
  axis: number,
  descending = false,
): Uint32Array {
  const { n, outer, inner } = axisLayout(t, axis),
    out = new Uint32Array(t.size);
  for (let o = 0; o < outer; o++)
    for (let i = 0; i < inner; i++) {
      const ix = Array.from({ length: n }, (_, k) => k).sort(
        (a, b) =>
          (t.data[o * n * inner + a * inner + i]! -
            t.data[o * n * inner + b * inner + i]!) *
          (descending ? -1 : 1),
      );
      for (let k = 0; k < n; k++) out[o * n * inner + k * inner + i] = ix[k]!;
    }
  return out;
}
export function reduceTensorAxis(
  t: Tensor,
  axis: number,
  op: "sum" | "mean" | "max" | "min",
): Tensor {
  const { n, outer, inner } = axisLayout(t, axis),
    shape = t.shape.filter((_, i) => i !== axis),
    out = Tensor.zeros(shape.length ? shape : [1]);
  for (let o = 0; o < outer; o++)
    for (let i = 0; i < inner; i++) {
      let v = op === "max" ? -Infinity : op === "min" ? Infinity : 0;
      for (let k = 0; k < n; k++) {
        const x = t.data[o * n * inner + k * inner + i]!;
        v =
          op === "max" ? Math.max(v, x) : op === "min" ? Math.min(v, x) : v + x;
      }
      out.data[o * inner + i] = op === "mean" ? v / n : v;
    }
  return out;
}
export function topK(
  values: ArrayLike<number>,
  k: number,
  largest = true,
): Array<{ index: number; value: number }> {
  if (!Number.isInteger(k) || k < 0) throw new Error("k must be non-negative.");
  return Array.from(values, (value, index) => ({ index, value }))
    .sort(
      (a, b) =>
        (largest ? b.value - a.value : a.value - b.value) || a.index - b.index,
    )
    .slice(0, k);
}
