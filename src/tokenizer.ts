export class VocabularyTokenizer {
  private tokens: string[] = ["<pad>", "<unk>", "<bos>", "<eos>"];
  private ids = new Map(this.tokens.map((t, i) => [t, i]));
  private split(s: string): string[] {
    return s.toLowerCase().match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
  }
  fit(texts: string[]): this {
    for (const text of texts)
      for (const t of this.split(text))
        if (!this.ids.has(t)) {
          this.ids.set(t, this.tokens.length);
          this.tokens.push(t);
        }
    return this;
  }
  encode(text: string, bos = false, eos = false): number[] {
    return [
      ...(bos ? [2] : []),
      ...this.split(text).map((t) => this.ids.get(t) ?? 1),
      ...(eos ? [3] : []),
    ];
  }
  decode(ids: number[]): string {
    return ids
      .filter((i) => i > 3)
      .map((i) => this.tokens[i] ?? "<unk>")
      .join(" ")
      .replace(/\s+([.,!?;:])/g, "$1");
  }
  get vocabSize(): number {
    return this.tokens.length;
  }
  get vocabulary(): string[] {
    return [...this.tokens];
  }
  state(): string {
    return JSON.stringify(this.tokens);
  }
  load(state: string): void {
    const t = JSON.parse(state) as string[];
    if (t.slice(0, 4).join("|") !== "<pad>|<unk>|<bos>|<eos>")
      throw Error("invalid tokenizer state");
    this.tokens = t;
    this.ids = new Map(t.map((v, i) => [v, i]));
  }
}
