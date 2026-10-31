export type ComputeNodeId = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type NodeRole =
  | "tokenizer"
  | "embedding"
  | "attention"
  | "feed-forward"
  | "sampling"
  | "memory"
  | "coordinator";
export interface ComputeTask<T = unknown> {
  id: string;
  run: (signal?: AbortSignal) => T | Promise<T>;
  dependsOn?: string[];
}
export interface NodeStatus {
  id: ComputeNodeId;
  role: NodeRole;
  busy: boolean;
  completed: number;
  failed: number;
  lastError?: string;
}
const ROLES: NodeRole[] = [
  "tokenizer",
  "embedding",
  "attention",
  "feed-forward",
  "sampling",
  "memory",
  "coordinator",
];
export class SevenNodeSystem {
  readonly nodeCount = 7 as const;
  private running = 0;
  private closed = false;
  private states: NodeStatus[] = ROLES.map((role, id) => ({
    id: id as ComputeNodeId,
    role,
    busy: false,
    completed: 0,
    failed: 0,
  }));
  constructor(readonly concurrency = 7) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 7)
      throw new Error("Concurrency must be 1..7.");
  }
  status(): NodeStatus[] {
    return this.states.map((s) => ({ ...s }));
  }
  async execute<T>(task: ComputeTask<T>, signal?: AbortSignal): Promise<T> {
    if (this.closed) throw new Error("Scheduler is closed.");
    if (signal?.aborted) throw new Error("Execution aborted.");
    if (!task.id) throw new Error("Task id required.");
    const node = this.states.find((s) => !s.busy && s.id < this.concurrency);
    if (!node)
      throw new Error(
        "No idle logical node; use executeGraph for scheduled work.",
      );
    node.busy = true;
    this.running++;
    try {
      const value = await task.run(signal);
      node.completed++;
      return value;
    } catch (e) {
      node.failed++;
      node.lastError = String(e);
      throw e;
    } finally {
      node.busy = false;
      this.running--;
    }
  }
  async executeGraph(
    tasks: ComputeTask[],
    signal?: AbortSignal,
  ): Promise<Map<string, unknown>> {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    if (byId.size !== tasks.length) throw new Error("Task IDs must be unique.");
    for (const t of tasks)
      for (const d of t.dependsOn ?? [])
        if (!byId.has(d)) throw new Error("Missing dependency: " + d);
    const result = new Map<string, unknown>(),
      pending = new Set(byId.keys());
    while (pending.size) {
      if (signal?.aborted) throw new Error("Execution aborted.");
      const ready = [...pending].filter((id) =>
        (byId.get(id)!.dependsOn ?? []).every((d) => result.has(d)),
      );
      if (!ready.length) throw new Error("Task graph contains a cycle.");
      for (let i = 0; i < ready.length; i += this.concurrency) {
        const batch = ready.slice(i, i + this.concurrency);
        const values = await Promise.all(
          batch.map(
            async (id) =>
              [id, await this.execute(byId.get(id)!, signal)] as const,
          ),
        );
        for (const [id, v] of values) {
          result.set(id, v);
          pending.delete(id);
        }
      }
    }
    return result;
  }
  close(): void {
    this.closed = true;
  }
}
