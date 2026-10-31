import { ParameterStore, Parameter } from "../core/parameters.js";
import { Random } from "../core/random.js";
import { Matrix, zeros } from "../core/tensor.js";
export class Embedding {
  readonly table: Parameter;
  constructor(
    store: ParameterStore,
    name: string,
    count: number,
    width: number,
    rng: Random,
  ) {
    this.table = store.add(name, count, width, rng, 1 / Math.sqrt(width));
  }
  forward(ids: number[]): Matrix {
    return ids.map((id) => {
      const row = this.table.value[id];
      if (!row) throw new Error(`Embedding id out of range: ${id}`);
      return [...row];
    });
  }
  backward(ids: number[], grad: Matrix): void {
    ids.forEach((id, i) => {
      for (let j = 0; j < grad[i]!.length; j++)
        this.table.grad[id]![j]! += grad[i]![j]!;
    });
  }
}
