import {Matrix,zeros,softmax} from "../core/tensor.js";
import {ParameterStore} from "../core/parameters.js";
import {Random} from "../core/random.js";
import {Linear} from "./linear.js";
/** Grouped-query attention forward primitive. KV heads are shared across query-head groups. */
export class GroupedQueryAttention{
 readonly query:Linear;readonly key:Linear;readonly value:Linear;readonly output:Linear;
 private readonly headSize:number;private readonly groupSize:number;
 constructor(store:ParameterStore,name:string,width:number,readonly queryHeads:number,readonly kvHeads:number,rng:Random){if(width%queryHeads!==0||queryHeads%kvHeads!==0)throw new Error("width must divide queryHeads and queryHeads must divide evenly across kvHeads.");this.headSize=width/queryHeads;this.groupSize=queryHeads/kvHeads;this.query=new Linear(store,name+".q",width,width,rng);this.key=new Linear(store,name+".k",width,kvHeads*this.headSize,rng);this.value=new Linear(store,name+".v",width,kvHeads*this.headSize,rng);this.output=new Linear(store,name+".out",width,width,rng);}
 forward(x:Matrix,causal=true):Matrix{if(!x.length)throw new Error("Attention input cannot be empty.");const q=this.query.forward(x),k=this.key.forward(x),v=this.value.forward(x),t=x.length,parts:Matrix[]=[];for(let h=0;h<this.queryHeads;h++){const kvh=Math.floor(h/this.groupSize),qs=h*this.headSize,ks=kvh*this.headSize,Q=q.map(r=>r.slice(qs,qs+this.headSize)),K=k.map(r=>r.slice(ks,ks+this.headSize)),V=v.map(r=>r.slice(ks,ks+this.headSize)),scores=zeros(t,t);for(let i=0;i<t;i++)for(let j=0;j<t;j++){if(causal&&j>i){scores[i]![j]=-1e9;continue;}let dot=0;for(let z=0;z<this.headSize;z++)dot+=Q[i]![z]!*K[j]![z]!;scores[i]![j]=dot/Math.sqrt(this.headSize);}const p=scores.map(softmax),ctx=zeros(t,this.headSize);for(let i=0;i<t;i++)for(let j=0;j<t;j++)for(let z=0;z<this.headSize;z++)ctx[i]![z]!+=p[i]![j]!*V[j]![z]!;parts.push(ctx);}const merged=x.map((_,i)=>parts.flatMap(p=>p[i]!));return this.output.forward(merged);}
}
