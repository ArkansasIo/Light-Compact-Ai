export const PAD_TOKEN="<pad>", UNK_TOKEN="<unk>", BOS_TOKEN="<bos>", EOS_TOKEN="<eos>";
export class VocabularyTokenizer {
  private tokenToId=new Map<string,number>();
  private idToToken:string[]=[];
  constructor() { for(const t of [PAD_TOKEN,UNK_TOKEN,BOS_TOKEN,EOS_TOKEN]) this.add(t); }
  private add(token:string):number { const old=this.tokenToId.get(token); if(old!==undefined)return old; const id=this.idToToken.length; this.tokenToId.set(token,id);this.idToToken.push(token);return id; }
  fit(texts:string[]):this { for(const text of texts) for(const token of this.tokenizeText(text)) this.add(token); return this; }
  private tokenizeText(text:string):string[] { return text.toLocaleLowerCase().match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? []; }
  encode(text:string,addBos=false,addEos=false):number[] {
    const ids=this.tokenizeText(text).map(t=>this.tokenToId.get(t)??1);
    return [...(addBos?[2]:[]),...ids,...(addEos?[3]:[])];
  }
  decode(ids:number[]):string {
    return ids.filter(id=>id>3).map(id=>this.idToToken[id]??UNK_TOKEN).join(" ").replace(/\s+([.,!?;:])/g,"$1");
  }
  get vocabSize():number{return this.idToToken.length;}
  get vocabulary():string[]{return [...this.idToToken];}
  state():string{return JSON.stringify(this.idToToken);}
  load(state:string):void {
    const arr=JSON.parse(state) as string[];
    if(arr.slice(0,4).join("|")!==[PAD_TOKEN,UNK_TOKEN,BOS_TOKEN,EOS_TOKEN].join("|")) throw new Error("Invalid tokenizer state");
    this.idToToken=[];this.tokenToId.clear();for(const t of arr)this.add(t);
  }
}
