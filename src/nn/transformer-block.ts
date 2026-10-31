import { Matrix, add } from "../core/tensor.js";
import { ParameterStore } from "../core/parameters.js";
import { Random } from "../core/random.js";
import { LayerNorm } from "./layer-norm.js";
import { MultiHeadSelfAttention, AttentionCache } from "./attention.js";
import { FeedForward } from "./feed-forward.js";
interface BlockCache { x:Matrix; norm1:Matrix; attn:AttentionCache; residual1:Matrix; norm2:Matrix; ff:{pre:Matrix;activated:Matrix;input:Matrix}; }
export class TransformerBlock {
  readonly norm1:LayerNorm;readonly attention:MultiHeadSelfAttention;readonly norm2:LayerNorm;readonly feedForward:FeedForward;
  constructor(store:ParameterStore,name:string,width:number,heads:number,hidden:number,rng:Random){
    this.norm1=new LayerNorm(store,`${name}.norm1`,width);this.attention=new MultiHeadSelfAttention(store,`${name}.attention`,width,heads,rng);
    this.norm2=new LayerNorm(store,`${name}.norm2`,width);this.feedForward=new FeedForward(store,`${name}.ffn`,width,hidden,rng);
  }
  forward(x:Matrix,causal:boolean):{output:Matrix;cache:BlockCache}{
    const n1=this.norm1.forward(x),a=this.attention.forward(n1,causal),r1=add(x,a.output),n2=this.norm2.forward(r1),f=this.feedForward.run(n2);
    return{output:add(r1,f.output),cache:{x,norm1:n1,attn:a.cache,residual1:r1,norm2:n2,ff:f}};
  }
  backward(cache:BlockCache,dy:Matrix):Matrix{
    const dNorm2=this.feedForward.back(cache.ff,dy),dResidualFF=this.norm2.backward(cache.residual1,dNorm2);
    const dResidual=dResidualFF.map((r,i)=>r.map((v,j)=>v+dy[i]![j]!));
    const dNorm1=this.attention.backward(cache.attn,dResidual),dInputAttn=this.norm1.backward(cache.x,dNorm1);
    return dInputAttn.map((r,i)=>r.map((v,j)=>v+dResidual[i]![j]!));
  }
}
