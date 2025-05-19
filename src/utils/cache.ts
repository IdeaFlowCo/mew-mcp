/**
 * A simple in-memory cache with TTL (Time To Live) support.
 */
export class Cache<T> {
  private cache: Map<string, { value: T; expiry: number }>;
  private ttl: number;

  constructor(ttlMs: number) {
    this.cache = new Map();
    this.ttl = ttlMs;
  }

  /**
   * Sets a value in the cache with the configured TTL.
   * @param key The cache key
   * @param value The value to cache
   */
  set(key: string, value: T): void {
    const expiry = Date.now() + this.ttl;
    this.cache.set(key, { value, expiry });
  }

  /**
   * Gets a value from the cache if it exists and hasn't expired.
   * @param key The cache key
   * @returns The cached value or undefined if not found/expired
   */
  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return item.value;
  }

  /**
   * Removes a value from the cache.
   * @param key The cache key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clears all values from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Checks if a key exists in the cache and hasn't expired.
   * @param key The cache key
   * @returns boolean indicating if the key exists and is valid
   */
  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }
} 