import {TransformerModel} from "./model.js";import {Adam,AdamConfig} from "./optimizer.js";
export interface TrainMetrics{loss:number;tokens:number;step:number;}
export class Trainer{
 readonly optimizer:Adam;
 constructor(readonly model:TransformerModel,config:AdamConfig={}){this.optimizer=new Adam(model.parameters,config);}
 trainSequence(input:number[],target:number[]):TrainMetrics{const r=this.model.lossAndGrad(input,target);this.optimizer.step();return{...r,step:this.optimizer.steps};}
 trainBatch(inputs:number[][],targets:number[][]):TrainMetrics{
  if(!inputs.length||inputs.length!==targets.length)throw Error("batch requires matching non-empty sequences");
  this.model.parameters.clear();let totalLoss=0,totalTokens=0;const gradients=this.model.parameters.all.map(p=>p.grad.map(r=>r.map(()=>0)));
  for(let n=0;n<inputs.length;n++){
   const r=this.model.lossAndGrad(inputs[n]!,targets[n]!);totalLoss+=r.loss;totalTokens+=r.tokens;
   this.model.parameters.all.forEach((p,k)=>p.grad.forEach((row,i)=>row.forEach((v,j)=>gradients[k]![i]![j]+=v)));
  }
  this.model.parameters.all.forEach((p,k)=>p.grad.forEach((row,i)=>row.forEach((_,j)=>p.grad[i]![j]=gradients[k]![i]![j]/inputs.length)));
  this.optimizer.step();return{loss:totalLoss/inputs.length,tokens:totalTokens,step:this.optimizer.steps};
 }
}
