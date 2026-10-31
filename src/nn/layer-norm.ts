import {
  ParameterStore,
  Parameter,
  rowVector,
  addVectorGrad,
} from "../core/parameters.js";
import {
  Matrix,
  Vector,
  layerNorm,
  layerNormBackward,
} from "../core/tensor.js";
export class LayerNorm {
  readonly gamma: Parameter;
  readonly beta: Parameter;
  private readonly eps: number;
  constructor(store: ParameterStore, name: string, width: number, eps = 1e-5) {
    this.gamma = store.addVector(`${name}.gamma`, width, 1);
    this.beta = store.addVector(`${name}.beta`, width, 0);
    this.eps = eps;
  }
  forward(x: Matrix): Matrix {
    return layerNorm(x, rowVector(this.gamma), rowVector(this.beta), this.eps);
  }
  backward(x: Matrix, dy: Matrix): Matrix {
    const g = layerNormBackward(x, dy, rowVector(this.gamma), this.eps);
    addVectorGrad(this.gamma, g.dGamma);
    addVectorGrad(this.beta, g.dBeta);
    return g.dx;
  }
}
