const DEFAULT_FISH_CHAT_TIMEOUT_MS = 60_000;

/**
 * Upper bound for any single outbound chat/inference HTTP call. A hung backend must
 * never strand a request that is holding a credit reservation and a concurrency slot.
 * Configured via FISH_CHAT_TIMEOUT_MS (milliseconds); defaults to 60s.
 */
export function getFishChatTimeoutMs(): number {
  const raw = process.env.FISH_CHAT_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_FISH_CHAT_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_FISH_CHAT_TIMEOUT_MS;
}

export function isAbortOrTimeoutError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && ((error as { name?: unknown }).name === "TimeoutError" || (error as { name?: unknown }).name === "AbortError");
}
