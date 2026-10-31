export type NodeKind = "module" | "class" | "type" | "structure" | "branch";
export interface TreeNode<T = unknown> {
  id: string;
  name: string;
  kind: NodeKind;
  parentId?: string;
  data?: T | undefined;
  metadata: Record<string, unknown>;
  children: TreeNode[];
}
let nextId = 0;
function containsNode(node: TreeNode, id: string): boolean {
  return (
    node.id === id || node.children.some((child) => containsNode(child, id))
  );
}
export class RecursiveNode<T = unknown> implements TreeNode<T> {
  readonly id: string;
  parentId?: string;
  readonly children: TreeNode[] = [];
  readonly metadata: Record<string, unknown> = {};
  constructor(
    public name: string,
    public kind: NodeKind,
    public data?: T,
  ) {
    this.id = `node-${++nextId}`;
  }
  addChild<N extends TreeNode>(child: N): this {
    if (child.id === this.id || this.contains(child.id))
      throw new Error("Adding child would create a cycle");
    child.parentId = this.id;
    this.children.push(child);
    return this;
  }
  contains(id: string): boolean {
    return this.children.some((child) => containsNode(child, id));
  }
  *walk(depth = 0): Generator<{ node: TreeNode; depth: number }> {
    yield { node: this, depth };
    for (const child of this.children) yield* walkNode(child, depth + 1);
  }
}
function* walkNode(
  node: TreeNode,
  depth: number,
): Generator<{ node: TreeNode; depth: number }> {
  yield { node, depth };
  for (const child of node.children) yield* walkNode(child, depth + 1);
}
export class ModuleNode extends RecursiveNode {
  constructor(name: string) {
    super(name, "module");
  }
}
export class ClassNode extends RecursiveNode {
  constructor(name: string) {
    super(name, "class");
  }
  addSubclass(child: ClassNode): this {
    return this.addChild(child);
  }
}
export class TypeNode extends RecursiveNode {
  constructor(name: string, data?: unknown) {
    super(name, "type", data);
  }
  addSubtype(child: TypeNode): this {
    return this.addChild(child);
  }
}
export class StructureNode extends RecursiveNode {
  constructor(name: string, data?: unknown) {
    super(name, "structure", data);
  }
  addStructure(child: StructureNode): this {
    return this.addChild(child);
  }
}
export class BranchNode extends RecursiveNode {
  constructor(name: string, data?: unknown) {
    super(name, "branch", data);
  }
  addBranch(child: BranchNode): this {
    return this.addChild(child);
  }
}
export class RecursiveRegistry {
  private roots: TreeNode[] = [];
  register(root: TreeNode): void {
    if (this.roots.some((n) => n.id === root.id))
      throw new Error("Duplicate root");
    this.roots.push(root);
  }
  *walk(): Generator<{ node: TreeNode; depth: number }> {
    for (const root of this.roots) yield* walkNode(root, 0);
  }
  find(id: string): TreeNode | undefined {
    for (const { node } of this.walk()) if (node.id === id) return node;
    return undefined;
  }
  transform(visitor: (node: TreeNode, depth: number) => void): void {
    for (const { node, depth } of this.walk()) visitor(node, depth);
  }
}
