import {ParameterStore} from "./engine.js";
export interface AdamConfig{learningRate?:number;beta1?:number;beta2?:number;epsilon?:number;weightDecay?:number;maxGradNorm?:number;}
export class Adam{
 private stepNo=0;private m=new Map<string,number[][]>();private v=new Map<string,number[][]>();
 readonly config:Required<AdamConfig>;
 constructor(private store:ParameterStore,c:AdamConfig={}){this.config={learningRate:c.learningRate??0.001,beta1:c.beta1??0.9,beta2:c.beta2??0.999,epsilon:c.epsilon??1e-8,weightDecay:c.weightDecay??0,maxGradNorm:c.maxGradNorm??1};}
 step():void{this.stepNo++;let norm2=0;for(const p of this.store.all)for(const r of p.grad)for(const g of r)norm2+=g*g;const norm=Math.sqrt(norm2),clip=norm>this.config.maxGradNorm?this.config.maxGradNorm/(norm+1e-12):1;
  for(const p of this.store.all){if(!this.m.has(p.name)){this.m.set(p.name,p.value.map(r=>r.map(()=>0)));this.v.set(p.name,p.value.map(r=>r.map(()=>0)));}const m=this.m.get(p.name)!,v=this.v.get(p.name)!;
   for(let i=0;i<p.value.length;i++)for(let j=0;j<p.value[i]!.length;j++){const g=p.grad[i]![j]!*clip;m[i]![j]=this.config.beta1*m[i]![j]!+(1-this.config.beta1)*g;v[i]![j]=this.config.beta2*v[i]![j]!+(1-this.config.beta2)*g*g;const mh=m[i]![j]!/(1-this.config.beta1**this.stepNo),vh=v[i]![j]!/(1-this.config.beta2**this.stepNo);p.value[i]![j]!-=this.config.learningRate*(mh/(Math.sqrt(vh)+this.config.epsilon)+this.config.weightDecay*p.value[i]![j]!);}
  }
 }
 get steps():number{return this.stepNo;}
}
