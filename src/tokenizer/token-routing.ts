import {
  TokenBranchGraph,
  type TokenNode,
  type TokenRecord,
} from "./token-graph.js";

export interface TokenRoute {
  modality: string;
  language: string;
  role: string;
  context: string;
}
export interface RoutedToken extends TokenRecord {
  route: TokenRoute;
}

/** Builds branches in the order modality -> language -> role -> context -> token. */
export class TokenRouter<T = Record<string, unknown>> {
  readonly graph = new TokenBranchGraph<T>("token-router");
  private readonly routes = new Map<number, string>();
  private readonly branchIds = new Map<string, string>();
  register(token: TokenRecord, route: TokenRoute, data?: T): TokenNode<T> {
    for (const [key, value] of Object.entries(route))
      if (!value.trim()) throw new Error(`Token route ${key} cannot be empty.`);
    if (this.routes.has(token.id))
      throw new Error(`Token ${token.id} is already routed.`);
    let parent = this.graph.root.id;
    for (const [dimension, value] of Object.entries(route)) {
      const key = `${parent}|${dimension}|${value}`;
      let branchId = this.branchIds.get(key);
      if (!branchId) {
        branchId = this.graph.addBranch(`${dimension}:${value}`, parent).id;
        this.branchIds.set(key, branchId);
      }
      parent = branchId;
    }
    const node = this.graph.addToken(token, parent, data);
    this.routes.set(token.id, node.id);
    return node;
  }
  lookup(tokenId: number): TokenNode<T> | undefined {
    const nodeId = this.routes.get(tokenId);
    return nodeId ? this.graph.getNode(nodeId) : undefined;
  }
  routeTokens(tokens: readonly RoutedToken[]): TokenNode<T>[] {
    return tokens.map(({ route, ...token }) => this.register(token, route));
  }
  listRoute(tokenId: number): string[] {
    const node = this.lookup(tokenId);
    if (!node) return [];
    const names = [node.name];
    let parentId = node.parentId;
    while (parentId) {
      const parent = this.graph.getNode(parentId);
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parentId;
    }
    return names;
  }
}
