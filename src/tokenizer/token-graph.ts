export type TokenNodeKind = "root" | "branch" | "subbranch" | "token";
export interface TokenNode<T = unknown> {
  readonly id: string;
  readonly name: string;
  readonly kind: TokenNodeKind;
  readonly parentId?: string;
  readonly children: TokenNode<T>[];
  readonly data?: T;
}
export interface TokenRecord { id: number; value: string; category?: string; metadata?: Record<string, unknown>; }

/** Hierarchical token tree: branches contain subbranches, which contain token leaves. */
export class TokenBranchGraph<T = Record<string, unknown>> {
  private nextId = 0;
  private readonly nodes = new Map<string, TokenNode<T>>();
  private readonly tokenIds = new Map<number, string>();
  readonly root: TokenNode<T>;
  constructor(name = "tokens") { this.root = this.make(name, "root"); }
  private make(name: string, kind: TokenNodeKind, parentId?: string, data?: T): TokenNode<T> {
    const id = `token-node-${++this.nextId}`;
    const node: TokenNode<T> = { id, name, kind, ...(parentId ? { parentId } : {}), children: [], ...(data === undefined ? {} : { data }) };
    this.nodes.set(id, node);
    if (parentId) this.nodes.get(parentId)!.children.push(node);
    return node;
  }
  addBranch(name: string, parentId = this.root.id): TokenNode<T> {
    const parent = this.require(parentId);
    if (parent.kind === "token") throw new Error("Token leaves cannot contain branches.");
    const existing = parent.children.find(child => child.name === name && (child.kind === "branch" || child.kind === "subbranch"));
    if (existing) return existing;
    return this.make(name, parent.kind === "root" ? "branch" : "subbranch", parentId);
  }
  addToken(record: TokenRecord, branchId: string, data?: T): TokenNode<T> {
    if (!Number.isInteger(record.id) || record.id < 0 || !record.value) throw new Error("Token requires a non-negative integer id and non-empty value.");
    if (this.tokenIds.has(record.id)) throw new Error(`Duplicate token id ${record.id}.`);
    const parent = this.require(branchId);
    if (parent.kind === "token") throw new Error("Tokens must be attached to a branch.");
    const node = this.make(record.value, "token", branchId, data);
    this.tokenIds.set(record.id, node.id);
    return node;
  }
  getToken(id: number): TokenNode<T> | undefined { const nodeId = this.tokenIds.get(id); return nodeId ? this.nodes.get(nodeId) : undefined; }
  getNode(id: string): TokenNode<T> | undefined { return this.nodes.get(id); }
  require(id: string): TokenNode<T> { const node = this.nodes.get(id); if (!node) throw new Error(`Unknown token graph node: ${id}`); return node; }
  *walk(startId = this.root.id, depth = 0): Generator<{ node: TokenNode<T>; depth: number }> {
    const start = this.require(startId);
    function* visit(node: TokenNode<T>, level: number): Generator<{ node: TokenNode<T>; depth: number }> {
      yield { node, depth: level };
      for (const child of node.children) yield* visit(child, level + 1);
    }
    yield* visit(start, depth);
  }
  findTokens(prefix: string): TokenNode<T>[] {
    const matches: TokenNode<T>[] = [];
    for (const { node } of this.walk()) if (node.kind === "token" && node.name.startsWith(prefix)) matches.push(node);
    return matches;
  }
  removeBranch(branchId: string): number {
    const branch = this.require(branchId);
    if (branch.kind === "root" || branch.kind === "token" || !branch.parentId) throw new Error("Only non-root branches can be removed.");
    let removed = 0;
    const remove = (node: TokenNode<T>) => { for (const child of [...node.children]) remove(child); if (node.kind === "token") { for (const [tokenId, nodeId] of this.tokenIds) if (nodeId === node.id) this.tokenIds.delete(tokenId); } this.nodes.delete(node.id); removed++; };
    remove(branch);
    const parent = this.require(branch.parentId);
    const index = parent.children.findIndex(child => child.id === branchId);
    if (index >= 0) parent.children.splice(index, 1);
    return removed;
  }
}
