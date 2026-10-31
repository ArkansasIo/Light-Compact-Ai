import {Matrix} from "../core/tensor.js";
export interface KVLayerState{keys:Matrix;values:Matrix;}
/** Per-layer append-only reference KV cache. Rows are token positions; columns are concatenated head dimensions. */
export class KVCache{
 private layers=new Map<number,KVLayerState>();constructor(readonly maxTokens:number){if(!Number.isInteger(maxTokens)||maxTokens<1)throw new Error("maxTokens must be positive.");}
 append(layer:number,key:Matrix,value:Matrix):void{if(!Number.isInteger(layer)||layer<0||!key.length||key.length!==value.length||key.some((r,i)=>r.length!==key[0]!.length||r.length!==value[i]!.length))throw new Error("Invalid KV append shape.");const prior=this.layers.get(layer),old=prior?.keys.length??0;if(old+key.length>this.maxTokens)throw new Error("KV cache capacity exceeded.");this.layers.set(layer,{keys:[...(prior?.keys??[]),...key.map(r=>[...r])],values:[...(prior?.values??[]),...value.map(r=>[...r])]});}
 get(layer:number):KVLayerState|undefined{const x=this.layers.get(layer);return x?{keys:x.keys.map(r=>[...r]),values:x.values.map(r=>[...r])}:undefined;}
 get length():number{return this.layers.values().next().value?.keys.length??0;}
 clear(layer?:number):void{if(layer===undefined)this.layers.clear();else this.layers.delete(layer);}
}
