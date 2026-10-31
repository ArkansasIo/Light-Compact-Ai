import {Matrix,zeros} from "../core/tensor.js";
export interface SwiGLUCache{input:Matrix;gatePre:Matrix;up:Matrix;activated:Matrix;}
const silu=(x:number)=>x/(1+Math.exp(-x));
const siluGrad=(x:number)=>{const s=1/(1+Math.exp(-x));return s*(1+x*(1-s));};
/** SwiGLU activation primitive; projections remain the caller's responsibility. */
export function swiglu(gatePre:Matrix,up:Matrix):{output:Matrix;cache:{gatePre:Matrix;up:Matrix;activated:Matrix}}{if(gatePre.length!==up.length||gatePre.some((r,i)=>r.length!==up[i]!.length))throw new Error("SwiGLU shape mismatch.");const activated=gatePre.map(r=>r.map(silu)),output=activated.map((r,i)=>r.map((v,j)=>v*up[i]![j]!));return{output,cache:{gatePre,up,activated}};}
export function swigluBackward(cache:{gatePre:Matrix;up:Matrix;activated:Matrix},dy:Matrix):{dGate:Matrix;dUp:Matrix}{const dGate=zeros(dy.length,dy[0]!.length),dUp=zeros(dy.length,dy[0]!.length);for(let i=0;i<dy.length;i++)for(let j=0;j<dy[i]!.length;j++){dGate[i]![j]=dy[i]![j]!*cache.up[i]![j]!*siluGrad(cache.gatePre[i]![j]!);dUp[i]![j]=dy[i]![j]!*cache.activated[i]![j]!;}return{dGate,dUp};}
