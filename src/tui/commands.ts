/** Slash commands available in the chat UI. */
export interface SlashCommand {
  name: string;
  description: string;
  /** Argument hint shown in suggestions, e.g. "<n>". */
  args?: string;
}

export const COMMANDS: SlashCommand[] = [
  { name: "help", description: "Show commands and keyboard shortcuts" },
  { name: "clear", description: "Clear the screen" },
  {
    name: "settings",
    description: "Change settings and options (also /config)",
  },
  { name: "model", description: "Show model and config details" },
  { name: "tokens", args: "<n>", description: "Set the maximum reply length" },
  { name: "train", description: "Retrain on the corpus and save the model" },
  { name: "history", description: "List prompts from this session" },
  {
    name: "sing",
    args: "<idea>",
    description: "Compose and sing an original song (Musical mode)",
  },
  {
    name: "voice",
    args: "[on|off|test]",
    description: "Speak replies with the Aurora voice",
  },
  { name: "exit", description: "Quit" },
];

export const SHORTCUTS: [string, string][] = [
  ["/", "commands"],
  ["↑ ↓", "history"],
  ["tab", "complete command"],
  ["esc", "clear input / interrupt"],
  ["ctrl+w", "delete word"],
  ["ctrl+u", "delete to start"],
  ["ctrl+l", "redraw screen"],
  ["ctrl+c ×2", "exit"],
];

/** Commands whose name starts with what was typed after "/". */
export function matchCommands(input: string): SlashCommand[] {
  if (!input.startsWith("/") || input.includes(" ")) return [];
  const query = input.slice(1).toLowerCase();
  return COMMANDS.filter((command) => command.name.startsWith(query));
}

/** Split "/name arg1 arg2" into its parts, or undefined for normal prompts. */
export function parseCommand(
  input: string,
): { name: string; args: string[] } | undefined {
  if (!input.startsWith("/")) return undefined;
  const [name = "", ...args] = input.slice(1).trim().split(/\s+/);
  return { name: name.toLowerCase(), args };
}
