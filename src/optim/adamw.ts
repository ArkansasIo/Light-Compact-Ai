import {ParameterStore} from "../core/parameters.js";
export interface AdamWConfig{learningRate?:number;beta1?:number;beta2?:number;epsilon?:number;weightDecay?:number;maxGradNorm?:number;}
/** AdamW with decoupled weight decay and global gradient clipping. */
export class AdamW{
 private stepNo=0;private m=new Map<string,number[][]>();private v=new Map<string,number[][]>();
 readonly config:Required<AdamWConfig>;
 constructor(private readonly store:ParameterStore,c:AdamWConfig={}){this.config={learningRate:c.learningRate??1e-3,beta1:c.beta1??0.9,beta2:c.beta2??0.999,epsilon:c.epsilon??1e-8,weightDecay:c.weightDecay??0.01,maxGradNorm:c.maxGradNorm??1};if(this.config.learningRate<=0||this.config.epsilon<=0||this.config.maxGradNorm<=0||this.config.weightDecay<0)throw new Error("Invalid AdamW hyperparameters.");}
 step():void{this.stepNo++;let norm2=0;for(const p of this.store.parameters)for(const row of p.grad)for(const g of row)norm2+=g*g;const norm=Math.sqrt(norm2),clip=norm>this.config.maxGradNorm?this.config.maxGradNorm/(norm+1e-12):1;const c=this.config;for(const p of this.store.parameters){if(!this.m.has(p.name)){this.m.set(p.name,p.value.map(r=>r.map(()=>0)));this.v.set(p.name,p.value.map(r=>r.map(()=>0)));}const m=this.m.get(p.name)!,v=this.v.get(p.name)!;for(let i=0;i<p.value.length;i++)for(let j=0;j<p.value[i]!.length;j++){const g=p.grad[i]![j]!*clip;m[i]![j]=c.beta1*m[i]![j]!+(1-c.beta1)*g;v[i]![j]=c.beta2*v[i]![j]!+(1-c.beta2)*g*g;const mh=m[i]![j]!/(1-c.beta1**this.stepNo),vh=v[i]![j]!/(1-c.beta2**this.stepNo);p.value[i]![j]!-=c.learningRate*(mh/(Math.sqrt(vh)+c.epsilon));p.value[i]![j]!-=c.learningRate*c.weightDecay*p.value[i]![j]!;}}}
 get steps():number{return this.stepNo;}
}
