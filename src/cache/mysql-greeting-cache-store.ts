import type { GreetingCacheEntry, GreetingCacheStore } from "./greeting-response-cache.js";

export interface SqlRow { cache_key: string; response_text: string; created_at: number | string; expires_at: number | string; hit_count: number | string; }
/** Minimal adapter contract; wrap your MySQL/PostgreSQL driver with these two methods. */
export interface SqlExecutor { query<T>(sql: string, parameters: readonly unknown[]): Promise<readonly T[]>; execute(sql: string, parameters: readonly unknown[]): Promise<void>; }

/** MySQL implementation matching database/schema/response-cache.mysql.sql. */
export class MysqlGreetingCacheStore implements GreetingCacheStore {
  constructor(private readonly db: SqlExecutor) {}
  async get(key: string, now: number): Promise<GreetingCacheEntry | undefined> {
    const rows = await this.db.query<SqlRow>("SELECT cache_key, response_text, created_at, expires_at, hit_count FROM response_cache WHERE cache_key = ? AND (expires_at = 0 OR expires_at > ?) LIMIT 1", [key, now]);
    const row = rows[0];
    if (!row) return undefined;
    return { key: row.cache_key, response: row.response_text, createdAt: Number(row.created_at), expiresAt: Number(row.expires_at), hits: Number(row.hit_count) };
  }
  async put(entry: GreetingCacheEntry): Promise<void> {
    await this.db.execute("INSERT INTO response_cache (cache_key, response_text, created_at, expires_at, hit_count) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE response_text = VALUES(response_text), created_at = VALUES(created_at), expires_at = VALUES(expires_at), hit_count = VALUES(hit_count)", [entry.key, entry.response, entry.createdAt, entry.expiresAt, entry.hits]);
  }
  async touch(key: string): Promise<void> {
    await this.db.execute("UPDATE response_cache SET hit_count = hit_count + 1 WHERE cache_key = ?", [key]);
  }
}
