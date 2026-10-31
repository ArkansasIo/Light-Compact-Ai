/** Dense row-major Float32 tensor for multidimensional engine operations. */
export type TensorShape = readonly number[];
export class Tensor {
  readonly data: Float32Array;
  readonly shape: number[];
  readonly strides: number[];
  constructor(data: Float32Array | number[], shape: TensorShape, copy = true) {
    if (!shape.length || shape.some(d => !Number.isInteger(d) || d < 1)) throw new Error("Tensor dimensions must be positive integers.");
    const size = shape.reduce((a,b)=>a*b,1);
    if (data.length !== size) throw new Error("Tensor data length does not match shape.");
    this.data = data instanceof Float32Array ? (copy ? new Float32Array(data) : data) : Float32Array.from(data);
    this.shape=[...shape]; this.strides=new Array(shape.length); let stride=1;
    for(let i=shape.length-1;i>=0;i--){this.strides[i]=stride;stride*=shape[i]!;}
  }
  get rank():number{return this.shape.length;}
  get size():number{return this.data.length;}
  offset(indices:number[]):number{
    if(indices.length!==this.rank)throw new Error("Incorrect tensor index rank.");
    let out=0;for(let i=0;i<indices.length;i++){const x=indices[i]!;if(!Number.isInteger(x)||x<0||x>=this.shape[i]!)throw new RangeError("Tensor index out of bounds.");out+=x*this.strides[i]!;}return out;
  }
  get(...indices:number[]):number{return this.data[this.offset(indices)]!;}
  set(value:number,...indices:number[]):void{this.data[this.offset(indices)]=value;}
  clone():Tensor{return new Tensor(this.data,this.shape);}
  static zeros(shape:TensorShape):Tensor{return new Tensor(new Float32Array(shape.reduce((a,b)=>a*b,1)),shape,false);}
}
