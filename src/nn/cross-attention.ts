import {Matrix,zeros,softmax,transpose,matMul} from "../core/tensor.js";
import {ParameterStore} from "../core/parameters.js";
import {Random} from "../core/random.js";
import {Linear} from "./linear.js";
/** Encoder-decoder attention: decoder states query encoder memory. */
export class CrossAttention {
 readonly query:Linear;readonly key:Linear;readonly value:Linear;readonly output:Linear;
 constructor(store:ParameterStore,name:string,width:number,readonly heads:number,rng:Random){if(width%heads!==0)throw new Error("width must divide by heads");this.query=new Linear(store,name+".q",width,width,rng);this.key=new Linear(store,name+".k",width,width,rng);this.value=new Linear(store,name+".v",width,width,rng);this.output=new Linear(store,name+".out",width,width,rng);}
 forward(decoder:Matrix,encoder:Matrix):Matrix{if(!decoder.length||!encoder.length)throw new Error("Cross-attention requires non-empty sequences.");const q=this.query.forward(decoder),k=this.key.forward(encoder),v=this.value.forward(encoder),d=q[0]!.length/this.heads,parts:Matrix[]=[];for(let h=0;h<this.heads;h++){const start=h*d,Q=q.map(r=>r.slice(start,start+d)),K=k.map(r=>r.slice(start,start+d)),V=v.map(r=>r.slice(start,start+d)),scores=zeros(Q.length,K.length);for(let i=0;i<Q.length;i++)for(let j=0;j<K.length;j++){let dot=0;for(let z=0;z<d;z++)dot+=Q[i]![z]!*K[j]![z]!;scores[i]![j]=dot/Math.sqrt(d);}const probs=scores.map(softmax),ctx=zeros(Q.length,d);for(let i=0;i<Q.length;i++)for(let j=0;j<K.length;j++)for(let z=0;z<d;z++)ctx[i]![z]!+=probs[i]![j]!*V[j]![z]!;parts.push(ctx);}const merged=decoder.map((_,i)=>parts.flatMap(p=>p[i]!));return this.output.forward(merged);}
}
