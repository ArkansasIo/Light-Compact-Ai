import { TransformerModel } from "./model.js";
export function saveCheckpoint(model: TransformerModel): string {
  return JSON.stringify({
    format: "light-compact-ai",
    version: 1,
    config: model.config,
    parameters: model.state(),
  });
}
export function loadCheckpoint(model: TransformerModel, json: string): void {
  const c = JSON.parse(json) as {
    format: string;
    version: number;
    parameters: Record<string, number[][]>;
  };
  if (c.format !== "light-compact-ai" || c.version !== 1)
    throw Error("unsupported checkpoint");
  model.loadState(c.parameters);
}
