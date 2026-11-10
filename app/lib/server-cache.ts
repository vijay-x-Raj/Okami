// High-Performance Server-Side Cache & Provider Circuit Breaker for Okami

interface CacheItem<T> {
  data: T;
  expires: number;
}

const cache = new Map<string, CacheItem<unknown>>();

export function getServerCache<T>(key: string): T | undefined {
  const item = cache.get(key);
  if (!item) return undefined;
  if (Date.now() > item.expires) {
    cache.delete(key);
    return undefined;
  }
  return item.data as T;
}

export function setServerCache<T>(key: string, data: T, ttlMs: number = 60 * 60 * 1000): void {
  if (cache.size > 2000) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

// Circuit breaker to avoid waiting on stalled / rate-limited Jikan API
let jikanFails = 0;
let jikanCooldown = 0;

export function isJikanAvailable(): boolean {
  return Date.now() > jikanCooldown;
}

export function reportJikanSuccess(): void {
  jikanFails = 0;
  jikanCooldown = 0;
}

export function reportJikanFailure(): void {
  jikanFails += 1;
  if (jikanFails >= 2) {
    // Back off from Jikan for 3 minutes to keep requests blazing fast
    jikanCooldown = Date.now() + 3 * 60 * 1000;
  }
}

