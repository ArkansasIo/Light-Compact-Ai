import {
  Matrix,
  Vector,
  matMul,
  transpose,
  zeros,
  vectorZeros,
} from "../core/tensor.js";
import {
  ParameterStore,
  Parameter,
  addVectorGrad,
} from "../core/parameters.js";
import { Random } from "../core/random.js";
export class Linear {
  readonly weight: Parameter;
  readonly bias: Parameter;
  constructor(
    store: ParameterStore,
    name: string,
    input: number,
    output: number,
    rng: Random,
  ) {
    this.weight = store.add(
      `${name}.weight`,
      input,
      output,
      rng,
      Math.sqrt(2 / (input + output)),
    );
    this.bias = store.addVector(`${name}.bias`, output);
  }
  forward(x: Matrix): Matrix {
    const y = matMul(x, this.weight.value),
      b = this.bias.value[0]!;
    return y.map((r) => r.map((v, j) => v + b[j]!));
  }
  backward(x: Matrix, dy: Matrix): Matrix {
    const dw = matMul(transpose(x), dy);
    for (let i = 0; i < dw.length; i++)
      for (let j = 0; j < dw[i]!.length; j++)
        this.weight.grad[i]![j]! += dw[i]![j]!;
    const db = vectorZeros(dy[0]!.length);
    for (const r of dy) for (let j = 0; j < r.length; j++) db[j]! += r[j]!;
    addVectorGrad(this.bias, db);
    return matMul(dy, transpose(this.weight.value));
  }
}
