import {Matrix} from "../core/tensor.js";
/** Applies rotary position embeddings to a [sequence, heads*headDimension] matrix. */
export function applyRotaryPositionEmbedding(x:Matrix,headCount:number,positionOffset=0,base=10000):Matrix{
 if(!x.length||!x[0]!.length||!Number.isInteger(headCount)||headCount<1||x[0]!.length%headCount!==0)throw new Error("Invalid RoPE matrix/head shape.");
 const width=x[0]!.length,headDim=width/headCount;if(headDim%2!==0)throw new Error("RoPE head dimension must be even.");
 return x.map((row,pos)=>{if(row.length!==width)throw new Error("RoPE matrix rows must have equal width.");const out=[...row],p=pos+positionOffset;for(let h=0;h<headCount;h++)for(let i=0;i<headDim;i+=2){const a=h*headDim+i,b=a+1,theta=p/Math.pow(base,i/headDim),c=Math.cos(theta),s=Math.sin(theta),u=row[a]!,v=row[b]!;out[a]=u*c-v*s;out[b]=u*s+v*c;}return out;});
}
