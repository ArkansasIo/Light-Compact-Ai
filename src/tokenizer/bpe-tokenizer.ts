/** Deterministic byte-level BPE tokenizer for a small, self-contained TypeScript runtime.
 * This reference trainer is intentionally simple; production corpora need streaming and optimized pair counting.
 */
export interface BpeState{version:1;merges:Array<[string,string]>;vocabulary:string[];specialTokens:string[];}
export class BpeTokenizer{
 private merges:Array<[string,string]>=[];private vocab=new Set<string>();private special=["<pad>","<unk>","<bos>","<eos>"];
 constructor(readonly targetVocabularySize=8000){if(!Number.isInteger(targetVocabularySize)||targetVocabularySize<260)throw new Error("BPE vocabulary size must be at least 260.");}
 private bytes(text:string):string[]{return Array.from(new TextEncoder().encode(text),b=>b.toString(16).padStart(2,"0"));}
 private pairKey(a:string,b:string):string{return a+"\u0001"+b;}
 train(texts:string[],maxMerges=this.targetVocabularySize-256):this{
  const corpus=texts.map(t=>this.bytes(t));this.vocab=new Set(["<pad>","<unk>","<bos>","<eos>",...Array.from({length:256},(_,i)=>i.toString(16).padStart(2,"0"))]);this.merges=[];
  for(let step=0;step<maxMerges;step++){
   const counts=new Map<string,{a:string;b:string;n:number}>();
   for(const seq of corpus)for(let i=0;i<seq.length-1;i++){const a=seq[i]!,b=seq[i+1]!,key=this.pairKey(a,b),v=counts.get(key);if(v)v.n++;else counts.set(key,{a,b,n:1});}
   let best:{a:string;b:string;n:number}|undefined;for(const v of counts.values())if(v.n>1&&(!best||v.n>best.n||(v.n===best.n&&this.pairKey(v.a,v.b)<this.pairKey(best.a,best.b))))best=v;
   if(!best)break;this.merges.push([best.a,best.b]);const merged=best.a+best.b;this.vocab.add(merged);
   for(let s=0;s<corpus.length;s++){const old=corpus[s]!,next:string[]=[];for(let i=0;i<old.length;){if(i<old.length-1&&old[i]===best.a&&old[i+1]===best.b){next.push(merged);i+=2;}else next.push(old[i++]!);}corpus[s]=next;}
  }return this;
 }
 encode(text:string,withBos=false,withEos=false):string[]{let pieces=this.bytes(text);for(const [a,b] of this.merges){const merged=a+b,next:string[]=[];for(let i=0;i<pieces.length;){if(i<pieces.length-1&&pieces[i]===a&&pieces[i+1]===b){next.push(merged);i+=2;}else next.push(pieces[i++]!);}pieces=next;}return[...(withBos?["<bos>"]:[]),...pieces,...(withEos?["<eos>"]:[])];}
 decode(tokens:string[]):string{const hex=tokens.filter(t=>!this.special.includes(t)).join("");if(hex.length%2)throw new Error("Malformed BPE byte sequence.");const bytes=new Uint8Array(hex.length/2);for(let i=0;i<bytes.length;i++){const v=Number.parseInt(hex.slice(i*2,i*2+2),16);if(!Number.isFinite(v))throw new Error("Unknown BPE token.");bytes[i]=v;}return new TextDecoder("utf-8",{fatal:false}).decode(bytes);}
 get vocabularySize():number{return this.vocab.size;}
 state():BpeState{return{version:1,merges:this.merges.map(x=>[...x] as [string,string]),vocabulary:[...this.vocab],specialTokens:[...this.special]};}
 load(state:BpeState):void{if(state.version!==1||!Array.isArray(state.merges)||!Array.isArray(state.vocabulary))throw new Error("Invalid BPE tokenizer state.");this.merges=state.merges.map(x=>[...x] as [string,string]);this.vocab=new Set(state.vocabulary);this.special=[...state.specialTokens];}
}
