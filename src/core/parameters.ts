import { Matrix, Vector, zeros, vectorZeros, randomMatrix } from "./tensor.js";
import { Random } from "./random.js";

export interface Parameter {
  name: string;
  value: Matrix;
  grad: Matrix;
}
export class ParameterStore {
  readonly parameters: Parameter[] = [];
  add(
    name: string,
    rows: number,
    cols: number,
    rng: Random,
    scale: number,
  ): Parameter {
    const p = {
      name,
      value: randomMatrix(rows, cols, rng, scale),
      grad: zeros(rows, cols),
    };
    this.parameters.push(p);
    return p;
  }
  addVector(name: string, n: number, initial = 0): Parameter {
    const p = {
      name,
      value: [Array<number>(n).fill(initial)],
      grad: [Array<number>(n).fill(0)],
    };
    this.parameters.push(p);
    return p;
  }
  zeroGrad(): void {
    for (const p of this.parameters)
      for (let i = 0; i < p.grad.length; i++) p.grad[i]!.fill(0);
  }
  namedState(): Record<string, Matrix> {
    return Object.fromEntries(
      this.parameters.map((p) => [p.name, p.value.map((r) => [...r])]),
    );
  }
  loadState(state: Record<string, Matrix>): void {
    for (const p of this.parameters) {
      const v = state[p.name];
      if (!v) throw new Error(`Missing checkpoint parameter ${p.name}`);
      if (
        v.length !== p.value.length ||
        v.some((r, i) => r.length !== p.value[i]!.length)
      )
        throw new Error(`Shape mismatch for ${p.name}`);
      p.value = v.map((r) => [...r]);
    }
  }
}
export function rowVector(p: Parameter): Vector {
  return p.value[0]!;
}
export function addVectorGrad(p: Parameter, g: Vector): void {
  for (let i = 0; i < g.length; i++) p.grad[0]![i]! += g[i]!;
}
