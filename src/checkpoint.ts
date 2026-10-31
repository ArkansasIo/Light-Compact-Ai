import { TransformerModel } from "./model.js";
export interface Checkpoint { format:"light-compact-ai";version:1;config:TransformerModel["config"];parameters:Record<string,number[][]>; }
export function saveCheckpoint(model:TransformerModel):string {
  const checkpoint:Checkpoint={format:"light-compact-ai",version:1,config:model.config,parameters:model.state()};
  return JSON.stringify(checkpoint);
}
export function loadCheckpoint(model:TransformerModel,json:string):void {
  const cp=JSON.parse(json) as Checkpoint;
  if(cp.format!=="light-compact-ai"||cp.version!==1)throw new Error("Unsupported checkpoint format");
  model.loadState(cp.parameters);
}
