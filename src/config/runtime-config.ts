export type Environment = "development" | "test" | "production";
export interface RuntimeConfig {
  environment: Environment;
  serviceName: string;
  database: { host: string; port: number; user: string; password: string; database: string; connectionLimit: number; };
  scheduler: { enabled: boolean; timezone: string; pollIntervalMs: number; };
  model: { maxContextTokens: number; maxBatchSize: number; precision: "fp32" | "fp16" | "int8" | "int4"; };
  cache: { maxBytes: number; defaultTtlMs: number; };
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive safe integer.`);
  return parsed;
}
function required(value: string | undefined, fallback: string, name: string): string {
  const result = value ?? fallback;
  if (!result.trim()) throw new Error(`${name} cannot be empty.`);
  return result;
}

/** Loads validated runtime settings from environment variables; secrets are never logged. */
export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const environment = (env.NODE_ENV ?? "development") as Environment;
  if (!["development", "test", "production"].includes(environment)) throw new Error("NODE_ENV must be development, test, or production.");
  const precision = env.LCAI_MODEL_PRECISION ?? "fp32";
  if (!["fp32", "fp16", "int8", "int4"].includes(precision)) throw new Error("LCAI_MODEL_PRECISION must be fp32, fp16, int8, or int4.");
  const cacheMaxBytes = positiveInteger(env.LCAI_CACHE_MAX_BYTES, 268435456, "LCAI_CACHE_MAX_BYTES");
  const cacheTtl = Number(env.LCAI_CACHE_TTL_MS ?? 0);
  if (!Number.isSafeInteger(cacheTtl) || cacheTtl < 0) throw new Error("LCAI_CACHE_TTL_MS must be a non-negative safe integer.");
  const poll = positiveInteger(env.LCAI_CRON_POLL_MS, 15000, "LCAI_CRON_POLL_MS");
  return {
    environment, serviceName: required(env.LCAI_SERVICE_NAME, "light-compact-ai", "LCAI_SERVICE_NAME"),
    database: { host: required(env.MYSQL_HOST, "127.0.0.1", "MYSQL_HOST"), port: positiveInteger(env.MYSQL_PORT, 3306, "MYSQL_PORT"), user: required(env.MYSQL_USER, "lcai", "MYSQL_USER"), password: env.MYSQL_PASSWORD ?? "", database: required(env.MYSQL_DATABASE, "light_compact_ai", "MYSQL_DATABASE"), connectionLimit: positiveInteger(env.MYSQL_CONNECTION_LIMIT, 10, "MYSQL_CONNECTION_LIMIT") },
    scheduler: { enabled: env.LCAI_CRON_ENABLED !== "false", timezone: required(env.TZ, "UTC", "TZ"), pollIntervalMs: poll },
    model: { maxContextTokens: positiveInteger(env.LCAI_MAX_CONTEXT_TOKENS, 10000, "LCAI_MAX_CONTEXT_TOKENS"), maxBatchSize: positiveInteger(env.LCAI_MAX_BATCH_SIZE, 8, "LCAI_MAX_BATCH_SIZE"), precision: precision as RuntimeConfig["model"]["precision"] },
    cache: { maxBytes: cacheMaxBytes, defaultTtlMs: cacheTtl }
  };
}
