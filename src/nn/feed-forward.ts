import { Matrix, zeros, gelu, geluDerivative } from "../core/tensor.js";
import { ParameterStore, Parameter } from "../core/parameters.js";
import { Random } from "../core/random.js";
import { Linear } from "./linear.js";
export class FeedForward {
  readonly first: Linear;
  readonly second: Linear;
  constructor(
    store: ParameterStore,
    name: string,
    width: number,
    hidden: number,
    rng: Random,
  ) {
    this.first = new Linear(store, `${name}.first`, width, hidden, rng);
    this.second = new Linear(store, `${name}.second`, hidden, width, rng);
  }
  forward(x: Matrix): { output: Matrix; pre: Matrix; activated: Matrix } {
    const pre = this.first.forward(x),
      activated = pre.map((r) => r.map(gelu));
    return { output: this.second.forward(activated), pre, activated };
  }
  backward(pre: Matrix, activated: Matrix, dy: Matrix): Matrix {
    const dAct = this.second.backward(activated, dy),
      dPre = dAct.map((r, i) =>
        r.map((v, j) => v * geluDerivative(pre[i]![j]!)),
      );
    return this.first.backward(pre.length ? this._input! : [], dPre);
  }
  private _input: Matrix | null = null;
  run(x: Matrix): {
    output: Matrix;
    pre: Matrix;
    activated: Matrix;
    input: Matrix;
  } {
    this._input = x.map((r) => [...r]);
    const f = this.forward(x);
    return { ...f, input: this._input };
  }
  back(
    cache: { pre: Matrix; activated: Matrix; input: Matrix },
    dy: Matrix,
  ): Matrix {
    const dAct = this.second.backward(cache.activated, dy),
      dPre = dAct.map((r, i) =>
        r.map((v, j) => v * geluDerivative(cache.pre[i]![j]!)),
      );
    return this.first.backward(cache.input, dPre);
  }
}
