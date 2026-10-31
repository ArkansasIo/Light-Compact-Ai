import { Random } from "./core/random.js";
import { Matrix, zeros, matMul, transpose, crossEntropy } from "./core/tensor.js";
import { ParameterStore } from "./core/parameters.js";
import { Embedding } from "./nn/embedding.js";
import { TransformerBlock } from "./nn/transformer-block.js";
export interface TransformerConfig {
  vocabSize:number;maxSequenceLength:number;dModel:number;numHeads:number;dFeedForward:number;numLayers:number;seed?:number;causal?:boolean;
}
interface ModelCache { ids:number[];embedded:Matrix;blocks:Array<ReturnType<TransformerBlock["forward"]>["cache"]>;hidden:Matrix; }
export class TransformerModel {
  readonly config:Required<TransformerConfig>;readonly parameters=new ParameterStore();
  private readonly rng:Random;private readonly tokenEmbedding:Embedding;private readonly positionEmbedding:Embedding;
  private readonly blocks:TransformerBlock[];private readonly outputWeight;
  constructor(config:TransformerConfig){
    if(config.vocabSize<2||config.maxSequenceLength<1||config.dModel<1||config.numHeads<1||config.dFeedForward<1||config.numLayers<1)throw new Error("Invalid transformer dimensions");
    if(config.dModel%config.numHeads!==0)throw new Error("dModel must be divisible by numHeads");
    this.config={...config,seed:config.seed??42,causal:config.causal??true};this.rng=new Random(this.config.seed);
    this.tokenEmbedding=new Embedding(this.parameters,"embedding.token",config.vocabSize,config.dModel,this.rng);
    this.positionEmbedding=new Embedding(this.parameters,"embedding.position",config.maxSequenceLength,config.dModel,this.rng);
    this.blocks=Array.from({length:config.numLayers},(_,i)=>new TransformerBlock(this.parameters,`blocks.${i}`,config.dModel,config.numHeads,config.dFeedForward,this.rng));
    this.outputWeight=this.parameters.add("output.weight",config.dModel,config.vocabSize,this.rng,Math.sqrt(1/config.dModel));
  }
  forward(ids:number[]):{logits:Matrix;cache:ModelCache}{
    if(!ids.length)throw new Error("Input sequence cannot be empty");
    if(ids.length>this.config.maxSequenceLength)throw new Error("Sequence exceeds maxSequenceLength");
    const tok=this.tokenEmbedding.forward(ids),pos=this.positionEmbedding.forward(ids.map((_,i)=>i));
    const embedded=tok.map((r,i)=>r.map((v,j)=>v+pos[i]![j]!));
    let hidden=embedded;const caches:ModelCache["blocks"]=[];
    for(const block of this.blocks){const f=block.forward(hidden,this.config.causal);hidden=f.output;caches.push(f.cache);}
    const logits=matMul(hidden,this.outputWeight.value);
    return{logits,cache:{ids:[...ids],embedded,blocks:caches,hidden}};
  }
  lossAndGrad(ids:number[],targets:number[]):{loss:number;tokens:number}{
    if(ids.length!==targets.length)throw new Error("Input/target length mismatch");
    this.parameters.zeroGrad();const f=this.forward(ids),ce=crossEntropy(f.logits,targets);
    let dHidden=matMul(ce.gradient,transpose(this.outputWeight.value));
    const dW=matMul(transpose(f.cache.hidden),ce.gradient);
    for(let i=0;i<dW.length;i++)for(let j=0;j<dW[i]!.length;j++)this.outputWeight.grad[i]![j]!+=dW[i]![j]!;
    for(let i=this.blocks.length-1;i>=0;i--)dHidden=this.blocks[i]!.backward(f.cache.blocks[i]!,dHidden);
    this.tokenEmbedding.backward(ids,dHidden);this.positionEmbedding.backward(ids.map((_,i)=>i),dHidden);
    return{loss:ce.loss,tokens:ce.count};
  }
  predictNext(ids:number[]):number{
    const {logits}=this.forward(ids);const row=logits[logits.length-1]!;
    let best=0;for(let i=1;i<row.length;i++)if(row[i]!>row[best]!)best=i;return best;
  }
  generate(prompt:number[],maxNewTokens:number):number[]{
    const out=[...prompt];
    for(let i=0;i<maxNewTokens;i++){
      const context=out.slice(-this.config.maxSequenceLength);out.push(this.predictNext(context));
    }
    return out;
  }
  state():Record<string,Matrix>{return this.parameters.namedState();}
  loadState(state:Record<string,Matrix>):void{this.parameters.loadState(state);}
}
