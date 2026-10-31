export interface GreetingCacheKey {
  text: string;
  locale: string;
  modelVersion: string;
  persona: string;
  userScope?: string;
}
export interface GreetingCacheEntry {
  key: string;
  response: string;
  createdAt: number;
  expiresAt: number;
  hits: number;
}
export interface GreetingCacheStore {
  get(key: string, now: number): Promise<GreetingCacheEntry | undefined>;
  put(entry: GreetingCacheEntry): Promise<void>;
  touch(key: string): Promise<void>;
}
export type GreetingResponder = (
  text: string,
  locale: string,
) => Promise<string>;

/** Normalizes only simple greeting text; it deliberately does not collapse arbitrary questions into a greeting. */
export function normalizeGreeting(text: string): string | undefined {
  const normalized = text
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[.!?,;:]+$/u, "")
    .replace(/\s+/gu, " ");
  if (normalized.length > 80) return undefined;
  const greetings = new Set([
    "hi",
    "hello",
    "hey",
    "hello there",
    "hi there",
    "good morning",
    "good afternoon",
    "good evening",
    "howdy",
  ]);
  return greetings.has(normalized) ? normalized : undefined;
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Database-backed greeting fast path. Personal/user-scoped replies never cross user boundaries. */
export class GreetingResponseCache {
  constructor(
    private readonly store: GreetingCacheStore,
    private readonly responder: GreetingResponder,
    private readonly ttlMs = 86400000,
  ) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 0)
      throw new Error("ttlMs must be a non-negative safe integer.");
  }
  async respond(
    input: GreetingCacheKey,
  ): Promise<{ response: string; cached: boolean }> {
    const greeting = normalizeGreeting(input.text);
    if (!greeting)
      return {
        response: await this.responder(input.text, input.locale),
        cached: false,
      };
    const scope = input.userScope ?? "public";
    const key = await digest(
      [greeting, input.locale, input.modelVersion, input.persona, scope].join(
        "\u001f",
      ),
    );
    const now = Date.now();
    const cached = await this.store.get(key, now);
    if (cached) {
      await this.store.touch(key);
      return { response: cached.response, cached: true };
    }
    const response = await this.responder(input.text, input.locale);
    await this.store.put({
      key,
      response,
      createdAt: now,
      expiresAt: this.ttlMs ? now + this.ttlMs : 0,
      hits: 0,
    });
    return { response, cached: false };
  }
}
