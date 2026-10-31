import { Matrix, Vector, zeros, matMul, transpose, softmax, vectorZeros } from "../core/tensor.js";
import { ParameterStore, Parameter } from "../core/parameters.js";
import { Random } from "../core/random.js";
import { Linear } from "./linear.js";
interface HeadCache { q:Matrix;k:Matrix;v:Matrix;probs:Matrix; }
export interface AttentionCache { x:Matrix;heads:HeadCache[];concat:Matrix; }
export class MultiHeadSelfAttention {
  readonly q:Linear;readonly k:Linear;readonly v:Linear;readonly out:Linear;
  private readonly headSize:number;private readonly heads:number;
  constructor(store:ParameterStore,name:string,width:number,heads:number,rng:Random) {
    if(width%heads!==0)throw new Error("dModel must be divisible by numHeads");
    this.heads=heads;this.headSize=width/heads;
    this.q=new Linear(store,`${name}.q`,width,width,rng);this.k=new Linear(store,`${name}.k`,width,width,rng);
    this.v=new Linear(store,`${name}.v`,width,width,rng);this.out=new Linear(store,`${name}.out`,width,width,rng);
  }
  forward(x:Matrix,causal:boolean):{output:Matrix;cache:AttentionCache} {
    const q=this.q.forward(x),k=this.k.forward(x),v=this.v.forward(x),t=x.length;
    const heads:HeadCache[]=[],parts:Matrix[]=[];
    for(let h=0;h<this.heads;h++){
      const start=h*this.headSize;
      const qh=q.map(r=>r.slice(start,start+this.headSize)),kh=k.map(r=>r.slice(start,start+this.headSize)),vh=v.map(r=>r.slice(start,start+this.headSize));
      const scores=zeros(t,t);
      for(let i=0;i<t;i++)for(let j=0;j<t;j++){
        if(causal&&j>i){scores[i]![j]=-1e9;continue;}
        let dot=0;for(let d=0;d<this.headSize;d++)dot+=qh[i]![d]!*kh[j]![d]!;
        scores[i]![j]=dot/Math.sqrt(this.headSize);
      }
      const probs=scores.map(r=>softmax(r));
      const context=zeros(t,this.headSize);
      for(let i=0;i<t;i++)for(let j=0;j<t;j++)for(let d=0;d<this.headSize;d++)context[i]![d]!+=probs[i]![j]!*vh[j]![d]!;
      parts.push(context);heads.push({q:qh,k:kh,v:vh,probs});
    }
    const concat=Array.from({length:t},(_,i)=>parts.flatMap(p=>p[i]!));
    return {output:this.out.forward(concat),cache:{x:x.map(r=>[...r]),heads,concat}};
  }
  backward(cache:AttentionCache,dy:Matrix):Matrix {
    const dConcat=this.out.backward(cache.concat,dy),t=cache.x.length;
    const dq=zeros(t,this.heads*this.headSize),dk=zeros(t,this.heads*this.headSize),dv=zeros(t,this.heads*this.headSize);
    for(let h=0;h<this.heads;h++){
      const hc=cache.heads[h]!,start=h*this.headSize,dc=dConcat.map(r=>r.slice(start,start+this.headSize));
      const dP=zeros(t,t),dV=zeros(t,this.headSize);
      for(let i=0;i<t;i++)for(let j=0;j<t;j++)for(let d=0;d<this.headSize;d++){
        dP[i]![j]!+=dc[i]![d]!*hc.v[j]![d]!;
        dV[j]![d]!+=hc.probs[i]![j]!*dc[i]![d]!;
      }
      const dS=zeros(t,t);
      for(let i=0;i<t;i++){
        let weighted=0;for(let j=0;j<t;j++)weighted+=dP[i]![j]!*hc.probs[i]![j]!;
        for(let j=0;j<t;j++)dS[i]![j]=hc.probs[i]![j]!* (dP[i]![j]!-weighted);
      }
      const dQ=zeros(t,this.headSize),dK=zeros(t,this.headSize),factor=1/Math.sqrt(this.headSize);
      for(let i=0;i<t;i++)for(let j=0;j<t;j++)for(let d=0;d<this.headSize;d++){
        dQ[i]![d]!+=dS[i]![j]!*hc.k[j]![d]!*factor;
        dK[j]![d]!+=dS[i]![j]!*hc.q[i]![d]!*factor;
      }
      for(let i=0;i<t;i++)for(let d=0;d<this.headSize;d++){
        dq[i]![start+d]=dQ[i]![d]!;dk[i]![start+d]=dK[i]![d]!;dv[i]![start+d]=dV[i]![d]!;
      }
    }
    const dxq=this.q.backward(cache.x,dq),dxk=this.k.backward(cache.x,dk),dxv=this.v.backward(cache.x,dv);
    return dxq.map((r,i)=>r.map((v,j)=>v+dxk[i]![j]!+dxv[i]![j]!));
  }
}
