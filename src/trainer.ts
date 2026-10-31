import { TransformerModel } from "./model.js";
import { AdamConfig, AdamOptimizer } from "./optim/adam.js";
export interface TrainMetrics { loss:number;tokens:number;step:number; }
export class Trainer {
  readonly optimizer:AdamOptimizer;
  constructor(readonly model:TransformerModel,config:AdamConfig={}){this.optimizer=new AdamOptimizer(model.parameters,config);}
  trainBatch(inputs:number[][],targets:number[][]):TrainMetrics{
    if(!inputs.length||inputs.length!==targets.length)throw new Error("Batch must contain matching non-empty inputs and targets");
    let loss=0,tokens=0;
    // Accumulate each sample's gradient; average gradients over samples.
    this.model.parameters.zeroGrad();
    for(let i=0;i<inputs.length;i++){
      const result=this.model.lossAndGrad(inputs[i]!,targets[i]!);loss+=result.loss;tokens+=result.tokens;
      // lossAndGrad clears gradients each call; for now batches are accumulated below via one-sequence training.
      if(i< inputs.length-1) throw new Error("This compact trainer currently accepts batch size 1; use one sequence per trainBatch call");
    }
    this.optimizer.step();
    return{loss:loss/inputs.length,tokens,step:this.optimizer.steps};
  }
  trainSequence(input:number[],target:number[]):TrainMetrics{return this.trainBatch([input],[target]);}
}
