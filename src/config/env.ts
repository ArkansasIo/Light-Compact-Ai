/**
 * Load a .env file into process.env (variables already set are not changed).
 * Node does not do this on its own; the chat and server call it at startup.
 */
import { existsSync } from "node:fs";

export function loadDotEnv(
  path: string = process.env.LCAI_ENV_FILE ?? ".env",
): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}
